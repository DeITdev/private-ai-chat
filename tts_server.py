from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from transformers import VitsModel, AutoTokenizer
import torch
import scipy.io.wavfile
import tempfile
import os

app = Flask(__name__)
CORS(app)

print("Loading MMS-TTS model for Indonesian...")
model = VitsModel.from_pretrained("facebook/mms-tts-ind")
tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-ind")
print("MMS-TTS model loaded successfully!")


@app.route('/synthesize', methods=['POST'])
def synthesize_speech():
    try:
        data = request.get_json()

        if 'text' not in data:
            return jsonify({'error': 'No text provided'}), 400

        text = data['text']

        # Tokenize input text
        inputs = tokenizer(text, return_tensors="pt")

        # Generate speech
        with torch.no_grad():
            output = model(**inputs).waveform

        # Convert to numpy array
        audio_data = output.squeeze().cpu().numpy()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            scipy.io.wavfile.write(
                temp_audio.name,
                rate=model.config.sampling_rate,
                data=audio_data
            )
            temp_audio_path = temp_audio.name

        # Log to console
        print(f"\n=== TTS Synthesis ===")
        print(f"Text: {text}")
        print(f"Sample rate: {model.config.sampling_rate}")
        print(f"Audio length: {len(audio_data)} samples")
        print(f"=====================\n")

        # Return audio file
        return send_file(
            temp_audio_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='speech.wav'
        )

    except Exception as e:
        print(f"Error during synthesis: {str(e)}")
        return jsonify({'error': str(e)}), 500

    finally:
        # Clean up temp file after sending
        if 'temp_audio_path' in locals() and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except:
                pass


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'model': 'facebook/mms-tts-ind',
        'language': 'Indonesian',
        'sampling_rate': model.config.sampling_rate
    })


if __name__ == '__main__':
    print("\n🔊 MMS-TTS Server Starting...")
    print("Server will run on http://localhost:5002")
    print("Model: facebook/mms-tts-ind (Indonesian)")
    print("Endpoints:")
    print("  POST /synthesize - Convert text to speech")
    print("  GET  /health     - Check server status")
    app.run(host='0.0.0.0', port=5002, debug=True)
