from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import tempfile
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load Whisper model (use 'base' for good balance of speed and accuracy)
print("Loading Whisper model...")
# You can change "base" to "tiny", "small", "medium", or "large" based on your needs
model = whisper.load_model("medium")
print("Whisper model loaded successfully!")


@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']

        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_audio:
            audio_file.save(temp_audio.name)
            temp_audio_path = temp_audio.name

        try:
            # Transcribe audio
            result = model.transcribe(temp_audio_path)
            transcribed_text = result['text']

            # Log to console
            print(f"\n=== Transcription Result ===")
            print(f"Text: {transcribed_text}")
            print(f"Language: {result.get('language', 'unknown')}")
            print(f"===========================\n")

            return jsonify({
                'success': True,
                'text': transcribed_text,
                'language': result.get('language', 'unknown')
            })

        finally:
            # Clean up temporary file
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)

    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'model': 'base'})


if __name__ == '__main__':
    print("\n🎤 Whisper Server Starting...")
    print("Server will run on http://localhost:5001")
    print("Endpoints:")
    print("  POST /transcribe - Transcribe audio file")
    print("  GET  /health     - Check server status")
    app.run(host='0.0.0.0', port=5001, debug=True)
