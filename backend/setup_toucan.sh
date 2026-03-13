#!/bin/bash
# IMS-Toucan Setup Script
# This script clones and sets up IMS-Toucan for the TTS server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOUCAN_DIR="$SCRIPT_DIR/../IMS-Toucan"

echo "🦜 IMS-Toucan Setup Script"
echo "=========================="

# Check if IMS-Toucan already exists
if [ -d "$TOUCAN_DIR" ]; then
    echo "⚠️  IMS-Toucan already exists at $TOUCAN_DIR"
    echo "   To reinstall, delete the directory first."
    read -p "Continue with dependency installation? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
else
    echo "📥 Cloning IMS-Toucan..."
    git clone https://github.com/DigitalPhonetics/IMS-Toucan.git "$TOUCAN_DIR"
    cd "$TOUCAN_DIR"
    # Use the MassiveScaleToucan branch for 7000+ language support
    git checkout MassiveScaleToucan
fi

echo ""
echo "📦 Installing system dependencies..."
echo "   (You may need to enter sudo password)"

# Install system dependencies (Ubuntu/Debian)
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y libsndfile1 espeak-ng ffmpeg libasound-dev libportaudio2 libsqlite3-dev
    echo "✅ System dependencies installed"
else
    echo "⚠️  Not a Debian-based system. Please install these packages manually:"
    echo "   libsndfile1 espeak-ng ffmpeg libasound-dev libportaudio2 libsqlite3-dev"
fi

echo ""
echo "📦 Installing Python dependencies..."

# Check if we're in a venv
if [ -z "$VIRTUAL_ENV" ]; then
    echo "⚠️  No virtual environment detected."
    echo "   It's recommended to install in a venv."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

cd "$TOUCAN_DIR"
pip install --no-cache-dir -r requirements.txt

# Also install soundfile if not in requirements
pip install soundfile

echo ""
echo "✅ IMS-Toucan setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Activate your virtual environment"
echo "   2. Run: python backend/tts_server_toucan.py"
echo "   3. The model will be downloaded automatically on first request"
echo ""
echo "🎤 To set a custom voice:"
echo "   POST /set-voice with {'audio_path': '/path/to/voice.wav'}"
