# Private AI Chat with 3D Avatar & RAG

A fully local AI chat application with 3D avatar visualization, voice interaction, and Retrieval-Augmented Generation (RAG) for document-based question answering.

## Features

- 🤖 **Local AI Chat** - Runs completely offline using Ollama (Mistral 7B)
- 🎭 **3D Avatar** - Interactive VRM model with lip-sync and blinking
- 🎤 **Voice Input** - Speech-to-text using Whisper (local)
- 🔊 **Voice Output** - Text-to-speech using MMS-TTS (Indonesian)
- 📚 **RAG System** - Query PDF documents for accurate, context-aware responses
- 💾 **Local Storage** - All data stored locally using IndexedDB
- 🌙 **Dark Mode** - Built-in theme support

## Architecture

```
Frontend (React + TypeScript)
    ↓
    ├─→ Whisper Server (Port 5001) - Speech Recognition
    ├─→ RAG Server (Port 5003) - Document Retrieval  [NEW]
    ├─→ Ollama (Port 11434) - LLM Processing
    └─→ TTS Server (Port 5002) - Speech Synthesis
```

## Quick Start

See [QUICK_START.md](QUICK_START.md) for detailed setup instructions.

### Prerequisites

1. **Node.js** (v18+) - For frontend
2. **Python** (v3.10+) - For backend servers
3. **Ollama** - For local LLM ([Download](https://ollama.ai))

### Installation

1. **Install Frontend Dependencies**

```bash
npm install
```

2. **Setup Python Environment**

```powershell
# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

3. **Install Ollama Model**

```bash
ollama pull mistral:7b
```

4. **Add PDF Documents** (Optional)
   Place Indonesian PDF files in `data/pdfs/` folder for RAG functionality.

### Running the Application

**You need 4 terminals:**

```powershell
# Terminal 1: Frontend
npm run dev

# Terminal 2: Whisper (activate venv first)
python whisper_server.py

# Terminal 3: TTS (activate venv first)
python tts_server.py

# Terminal 4: RAG (activate venv first)  [NEW]
python rag_server.py
```

Access the app at: http://localhost:5173

## RAG (Retrieval-Augmented Generation)

The RAG system allows your AI avatar to answer questions based on your PDF documents with accurate, real information.

### Setup RAG

1. **Add PDFs** - Place Indonesian PDF documents in `data/pdfs/`
2. **Start Server** - Run `python rag_server.py`
3. **Auto-Index** - Server automatically processes and indexes PDFs
4. **Query** - Ask questions and get context-aware responses

See [RAG_SETUP.md](RAG_SETUP.md) for detailed RAG configuration.

### RAG Features

- ✅ Automatic PDF text extraction
- ✅ Intelligent text chunking (800 chars, 150 overlap)
- ✅ Indonesian-optimized embeddings (paraphrase-multilingual-MiniLM-L12-v2)
- ✅ Vector search with ChromaDB
- ✅ Auto re-indexing on file changes
- ✅ Top-3 relevant chunk retrieval

## Project Structure

```
private-ai-chat/
├── src/                      # Frontend source
│   ├── pages/
│   │   ├── ChatPage.tsx      # Text chat interface
│   │   └── AvatarPage.tsx    # 3D avatar + voice interface
│   └── components/
│       └── VRMViewer.tsx     # 3D avatar renderer
├── data/
│   ├── pdfs/                 # PDF documents for RAG [NEW]
│   └── vector_store/         # ChromaDB persistence [NEW]
├── whisper_server.py         # Speech-to-text (Port 5001)
├── tts_server.py             # Text-to-speech (Port 5002)
├── rag_server.py             # RAG system (Port 5003) [NEW]
└── requirements.txt          # Python dependencies
```

## Tech Stack

### Frontend

- React + TypeScript + Vite
- Three.js + @pixiv/three-vrm (3D rendering)
- Dexie.js (IndexedDB wrapper)
- Tailwind CSS + shadcn/ui

### Backend

- Flask + Flask-CORS (Web servers)
- OpenAI Whisper (Speech recognition)
- Transformers + MMS-TTS (Speech synthesis)
- **ChromaDB** (Vector database) [NEW]
- **Sentence-Transformers** (Embeddings) [NEW]
- **PyPDF2** (PDF processing) [NEW]

### AI/ML

- Ollama + Mistral 7B (Local LLM)
- Whisper Base (Speech-to-text)
- facebook/mms-tts-ind (Indonesian TTS)
- **paraphrase-multilingual-MiniLM-L12-v2** (Embeddings) [NEW]

## Usage

### Voice Mode (Avatar Page)

1. Click microphone button
2. Speak your question in Indonesian
3. RAG system retrieves relevant PDF context
4. Avatar responds with synthesized voice
5. Mouth animates in sync with speech

### Chat Mode

1. Type your message
2. RAG system finds relevant document chunks
3. LLM generates context-aware response
4. Response displayed in chat interface

## Configuration

### RAG Settings (`rag_server.py`)

```python
CHUNK_SIZE = 800          # Characters per chunk
CHUNK_OVERLAP = 150       # Overlap between chunks
TOP_K_RESULTS = 3         # Number of chunks to retrieve
```

### LLM Settings

- Model: `mistral:7b`
- Language: Indonesian
- Response style: Short and direct

## API Endpoints

### Whisper Server (5001)

- `POST /transcribe` - Convert audio to text
- `GET /health` - Health check

### TTS Server (5002)

- `POST /synthesize` - Convert text to speech
- `GET /health` - Health check

### RAG Server (5003) [NEW]

- `POST /query` - Query documents for context
- `POST /reindex` - Re-index all PDFs
- `GET /stats` - Get indexing statistics
- `GET /health` - Health check

## Development

```bash
# Frontend dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Troubleshooting

### Common Issues

**RAG server not starting**

- Check Python dependencies installed
- Ensure `data/pdfs/` folder exists
- Verify port 5003 is available

**No context from PDFs**

- Confirm PDFs are in `data/pdfs/`
- Check server logs for indexing errors
- Try re-indexing: `curl -X POST http://localhost:5003/reindex`

**Voice not working**

- Grant microphone permissions
- Check all 4 servers are running
- Verify Ollama is running: `ollama list`

See [RAG_SETUP.md](RAG_SETUP.md) for detailed troubleshooting.

## Contributing

This is a private project, but feel free to fork and customize for your needs.

## License

MIT

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ["./tsconfig.node.json", "./tsconfig.app.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from "eslint-plugin-react";

export default tseslint.config({
  // Set the react version
  settings: { react: { version: "18.3" } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs["jsx-runtime"].rules,
  },
});
```
