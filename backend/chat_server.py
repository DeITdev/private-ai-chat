from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests
import json

app = Flask(__name__)
CORS(app)

# Ollama on default port, only accessible locally
OLLAMA_URL = "http://localhost:11434"


@app.route('/chat', methods=['POST'])
def chat():
    """
    Proxy endpoint for Ollama chat
    Receives chat request from frontend, forwards to local Ollama
    """
    try:
        data = request.json
        messages = data.get('messages', [])
        model = data.get('model', 'mistral:latest')
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
        response = requests.get(f"{OLLAMA_URL}/api/version")
        return jsonify({
            "status": "healthy",
            "ollama": response.json()
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500


if __name__ == '__main__':
    print("🚀 Starting Chat Server on port 5004...")
    print(f"   Proxying to Ollama at {OLLAMA_URL}")
    app.run(host='0.0.0.0', port=5004, debug=True)
