"""
Chat Server with Async TTS Integration
Proxies chat requests to Ollama and streams sentence-by-sentence to TTS.
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests
import json
import re
import queue
import threading

app = Flask(__name__)
CORS(app)

# Server URLs
OLLAMA_URL = "http://localhost:11434"
TTS_URL = "http://localhost:5002"

# Sentence boundary regex
SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?])\s+|(?<=[。！？])')


def split_into_sentences(text):
    """Split text into sentences for TTS processing."""
    sentences = SENTENCE_BOUNDARY.split(text)
    return [s.strip() for s in sentences if s.strip()]


@app.route('/chat', methods=['POST'])
def chat():
    """
    Standard chat endpoint - proxies to Ollama with streaming.
    """
    try:
        data = request.json
        messages = data.get('messages', [])
        model = data.get('model', 'mistral:7b')
        stream = data.get('stream', True)

        # Forward request to local Ollama
        ollama_response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": stream
            },
            stream=True
        )

        if stream:
            # Stream response back to client
            def generate():
                for line in ollama_response.iter_lines():
                    if line:
                        yield line + b'\n'

            return Response(
                stream_with_context(generate()),
                content_type='application/x-ndjson'
            )
        else:
            return jsonify(ollama_response.json())

    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/chat-with-tts', methods=['POST'])
def chat_with_tts():
    """
    Chat endpoint that streams LLM response and synthesizes TTS asynchronously.
    
    Flow:
    1. Stream tokens from Ollama
    2. Buffer until sentence boundary
    3. Queue complete sentences to TTS (async)
    4. Return JSON with text and audio URL per sentence
    
    Request JSON:
        messages: array - Chat messages
        model: str - LLM model name (default: mistral:7b)
        tts_language: str - TTS language code (default: ind)
    
    Response (NDJSON stream):
        {"type": "text", "content": "sentence text", "sentence_id": 0}
        {"type": "audio", "sentence_id": 0, "audio_base64": "..."}
        {"type": "done"}
    """
    try:
        data = request.json
        messages = data.get('messages', [])
        model = data.get('model', 'mistral:7b')
        tts_language = data.get('tts_language', 'ind')
        
        def generate():
            # Stream from Ollama
            ollama_response = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True
                },
                stream=True
            )
            
            buffer = ""
            sentence_id = 0
            sentences_to_synthesize = []
            full_response = ""
            
            for line in ollama_response.iter_lines():
                if not line:
                    continue
                    
                try:
                    chunk = json.loads(line)
                    token = chunk.get('message', {}).get('content', '')
                    buffer += token
                    full_response += token
                    
                    # Check for sentence boundaries
                    sentences = split_into_sentences(buffer)
                    
                    if len(sentences) > 1:
                        # Complete sentence found
                        for sentence in sentences[:-1]:
                            # Send text event
                            yield json.dumps({
                                "type": "text",
                                "content": sentence,
                                "sentence_id": sentence_id
                            }) + '\n'
                            
                            sentences_to_synthesize.append({
                                "sentence": sentence,
                                "id": sentence_id
                            })
                            sentence_id += 1
                        
                        # Keep incomplete sentence in buffer
                        buffer = sentences[-1]
                    
                    # Check if response is done
                    if chunk.get('done', False):
                        # Send remaining buffer
                        if buffer.strip():
                            yield json.dumps({
                                "type": "text",
                                "content": buffer.strip(),
                                "sentence_id": sentence_id
                            }) + '\n'
                            
                            sentences_to_synthesize.append({
                                "sentence": buffer.strip(),
                                "id": sentence_id
                            })
                        
                        break
                        
                except json.JSONDecodeError:
                    continue
            
            # Synthesize all sentences (after LLM is done for simpler implementation)
            # In a production system, this would be done in parallel
            import base64
            
            for item in sentences_to_synthesize:
                try:
                    tts_response = requests.post(
                        f"{TTS_URL}/synthesize",
                        json={
                            "text": item["sentence"],
                            "language": tts_language
                        },
                        timeout=60
                    )
                    
                    if tts_response.status_code == 200:
                        audio_base64 = base64.b64encode(tts_response.content).decode('utf-8')
                        yield json.dumps({
                            "type": "audio",
                            "sentence_id": item["id"],
                            "audio_base64": audio_base64
                        }) + '\n'
                    else:
                        yield json.dumps({
                            "type": "error",
                            "sentence_id": item["id"],
                            "error": f"TTS failed: {tts_response.status_code}"
                        }) + '\n'
                        
                except Exception as e:
                    yield json.dumps({
                        "type": "error",
                        "sentence_id": item["id"],
                        "error": str(e)
                    }) + '\n'
            
            # Send done event
            yield json.dumps({
                "type": "done",
                "full_response": full_response
            }) + '\n'
        
        return Response(
            stream_with_context(generate()),
            content_type='application/x-ndjson'
        )
        
    except Exception as e:
        print(f"Error in chat-with-tts endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/models', methods=['GET'])
def list_models():
    """List available models from local Ollama"""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags")
        return jsonify(response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        ollama_health = requests.get(f"{OLLAMA_URL}/api/version", timeout=5)
        ollama_status = "healthy" if ollama_health.ok else "unhealthy"
    except:
        ollama_status = "unreachable"
    
    try:
        tts_health = requests.get(f"{TTS_URL}/health", timeout=5)
        tts_status = "healthy" if tts_health.ok else "unhealthy"
        tts_info = tts_health.json() if tts_health.ok else {}
    except:
        tts_status = "unreachable"
        tts_info = {}
    
    return jsonify({
        "status": "healthy" if ollama_status == "healthy" else "degraded",
        "ollama": ollama_status,
        "tts": tts_status,
        "tts_info": tts_info
    })


if __name__ == '__main__':
    print("🚀 Starting Chat Server with TTS Integration on port 5004...")
    print(f"   Ollama: {OLLAMA_URL}")
    print(f"   TTS:    {TTS_URL}")
    print("\nEndpoints:")
    print("  POST /chat         - Standard chat (LLM only)")
    print("  POST /chat-with-tts - Chat with TTS synthesis")
    print("  GET  /models       - List available models")
    print("  GET  /health       - Check server status")
    app.run(host='0.0.0.0', port=5004, debug=False)
