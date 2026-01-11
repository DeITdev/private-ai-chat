"""
IMS-Toucan TTS Server with Controllable Voice Generation
Text-to-Speech server using IMS-Toucan for high-quality, multilingual synthesis.
Supports gender control and other voice parameters via GAN-based speaker embeddings.
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch
import tempfile
import os
import sys

# Add IMS-Toucan to path (assumes it's cloned at ../IMS-Toucan)
TOUCAN_PATH = os.path.join(os.path.dirname(__file__), "..", "IMS-Toucan")
if os.path.exists(TOUCAN_PATH):
    sys.path.insert(0, TOUCAN_PATH)

app = Flask(__name__)
CORS(app)

# Global TTS interface (lazy loaded)
controllable_interface = None
# Use CPU for TTS since GPU is typically occupied by Whisper
# IMS-Toucan is efficient enough to run on CPU for real-time synthesis
DEVICE = "cpu"
SAMPLE_RATE = 24000  # Toucan outputs 24kHz audio

# Default voice settings
DEFAULT_LANGUAGE = "ind"  # Indonesian (ISO 639-3)
DEFAULT_VOICE_SEED = 5  # Random voice seed (0-10)
DEFAULT_GENDER = 10  # Gender: -10 (male) to 10 (female) - set to 10 for girl voice


def get_tts():
    """Lazy load the Controllable TTS model."""
    global controllable_interface
    if controllable_interface is None:
        print(f"Loading IMS-Toucan Controllable TTS on {DEVICE}...")
        try:
            from InferenceInterfaces.ControllableInterface import ControllableInterface
            
            controllable_interface = ControllableInterface(
                gpu_id=DEVICE,
                available_artificial_voices=50  # Pre-generate 50 random voices
            )
            
            print("IMS-Toucan Controllable TTS loaded successfully!")
        except ImportError as e:
            print(f"Error: IMS-Toucan not found. Please clone it to {TOUCAN_PATH}")
            print(f"Details: {e}")
            raise
    return controllable_interface


@app.route('/synthesize', methods=['POST'])
def synthesize_speech():
    """
    Synthesize speech from text with controllable voice parameters.
    
    Request JSON:
        text: str - Text to synthesize (required)
        language: str - ISO 639-3 language code (default: ind)
        voice_seed: int - Voice seed 0-10 (default: 5)
        gender: float - Gender: -10 (male) to 10 (female) (default: 0)
        prosody_creativity: float - Prosody variation 0-0.8 (default: 0.5)
        duration_scale: float - Speaking speed 0.7-1.3 (default: 1.0)
        pitch_variance: float - Pitch variation 0.6-1.4 (default: 1.0)
        energy_variance: float - Energy variation 0.6-1.4 (default: 1.0)
        reference_audio: str - Optional path to reference audio for voice cloning
    
    Returns:
        WAV audio file
    """
    try:
        data = request.get_json()

        if 'text' not in data:
            return jsonify({'error': 'No text provided'}), 400

        text = data['text']
        language = data.get('language', DEFAULT_LANGUAGE)
        voice_seed = int(data.get('voice_seed', DEFAULT_VOICE_SEED))
        gender = float(data.get('gender', DEFAULT_GENDER))
        prosody_creativity = float(data.get('prosody_creativity', 0.5))
        duration_scale = float(data.get('duration_scale', 1.0))
        pitch_variance = float(data.get('pitch_variance', 1.0))
        energy_variance = float(data.get('energy_variance', 1.0))
        reference_audio = data.get('reference_audio', None)
        
        # Validate reference audio path
        if reference_audio and not os.path.exists(reference_audio):
            reference_audio = None
        
        # Clamp values to valid ranges
        voice_seed = max(0, min(10, voice_seed))
        gender = max(-10, min(10, gender))
        prosody_creativity = max(0, min(0.8, prosody_creativity))
        duration_scale = max(0.7, min(1.3, duration_scale))

        tts = get_tts()

        # Generate speech using ControllableInterface
        # The 6 embedding sliders control different voice characteristics
        # Based on IMS-Toucan's implementation:
        # - emb_slider_1: Gender (most significant for gender control)
        # - emb_slider_2 to emb_slider_6: Other voice characteristics
        sr, wave, _ = tts.read(
            prompt=text,
            reference_audio=reference_audio,
            language=language,
            accent=language,  # Use same language for accent
            voice_seed=voice_seed,
            prosody_creativity=prosody_creativity,
            duration_scaling_factor=duration_scale,
            pause_duration_scaling_factor=1.0,
            pitch_variance_scale=pitch_variance,
            energy_variance_scale=energy_variance,
            emb_slider_1=gender,      # Gender control (-10 to 10)
            emb_slider_2=0,           # Additional voice characteristics
            emb_slider_3=0,
            emb_slider_4=0,
            emb_slider_5=0,
            emb_slider_6=0,
            loudness_in_db=-29.0
        )

        # Save to temporary WAV file
        import soundfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            soundfile.write(temp_audio.name, wave, sr, subtype='PCM_16')
            temp_audio_path = temp_audio.name

        # Log to console
        print(f"\n=== TTS Synthesis ===")
        print(f"Text: {text[:80]}{'...' if len(text) > 80 else ''}")
        print(f"Language: {language}")
        print(f"Voice seed: {voice_seed}, Gender: {gender}")
        print(f"Device: {DEVICE}")
        print(f"Audio length: {len(wave)} samples ({len(wave)/sr:.2f}s)")
        print(f"=====================\n")

        # Return audio file
        return send_file(
            temp_audio_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name='speech.wav'
        )

    except Exception as e:
        import traceback
        print(f"Error during synthesis: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

    finally:
        # Clean up temp file after sending
        if 'temp_audio_path' in locals() and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except:
                pass


@app.route('/voice-settings', methods=['GET'])
def get_voice_settings():
    """
    Get current voice settings and available ranges.
    """
    return jsonify({
        'default_language': DEFAULT_LANGUAGE,
        'default_voice_seed': DEFAULT_VOICE_SEED,
        'default_gender': DEFAULT_GENDER,
        'ranges': {
            'voice_seed': {'min': 0, 'max': 10, 'description': 'Random voice seed'},
            'gender': {'min': -10, 'max': 10, 'description': 'Voice gender: -10 (male) to 10 (female)'},
            'prosody_creativity': {'min': 0, 'max': 0.8, 'description': 'Prosody variation'},
            'duration_scale': {'min': 0.7, 'max': 1.3, 'description': 'Speaking speed'},
            'pitch_variance': {'min': 0.6, 'max': 1.4, 'description': 'Pitch variation'},
            'energy_variance': {'min': 0.6, 'max': 1.4, 'description': 'Energy variation'}
        }
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'model': 'IMS-Toucan Controllable',
        'language': DEFAULT_LANGUAGE,
        'device': DEVICE,
        'sampling_rate': SAMPLE_RATE,
        'gpu_available': torch.cuda.is_available(),
        'features': ['gender_control', 'voice_seed', 'voice_cloning', 'prosody_control']
    })


if __name__ == '__main__':
    print("\n🔊 IMS-Toucan Controllable TTS Server Starting...")
    print(f"Device: {DEVICE}")
    print("Server will run on http://localhost:5002")
    print(f"Language: {DEFAULT_LANGUAGE} (Indonesian)")
    print("\nFeatures:")
    print("  ✓ Gender control (-10 male to +10 female)")
    print("  ✓ Voice seed selection (50 pre-generated voices)")
    print("  ✓ Voice cloning from reference audio")
    print("  ✓ Prosody/speed/pitch control")
    print("\nEndpoints:")
    print("  POST /synthesize      - Convert text to speech")
    print("  GET  /voice-settings  - Get available voice settings")
    print("  GET  /health          - Check server status")
    print("\nNote: Model will be loaded on first request (lazy loading)")
    app.run(host='0.0.0.0', port=5002, debug=False)
