from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
import PyPDF2
import os
import hashlib
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Configuration
PDF_FOLDER = "data/pdfs"
VECTOR_STORE_PATH = "data/vector_store"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150
TOP_K_RESULTS = 3
RELEVANCE_THRESHOLD = 0.5  # Only return results with similarity score above this

# Initialize embedding model (Indonesian-optimized)
print("Loading embedding model: paraphrase-multilingual-MiniLM-L12-v2...")
embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
print("Embedding model loaded successfully!")

# Initialize ChromaDB
client = chromadb.PersistentClient(path=VECTOR_STORE_PATH)
collection = client.get_or_create_collection(
    name="pdf_documents",
    metadata={"hnsw:space": "cosine"}
)


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]

        # Don't create tiny chunks at the end
        if len(chunk) < 100 and chunks:
            # Append to last chunk instead
            chunks[-1] += " " + chunk
        else:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def extract_text_from_pdf(pdf_path):
    """Extract text content from PDF file."""
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""

            for page_num, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text += f"\n--- Page {page_num + 1} ---\n{page_text}"

            return text.strip()
    except Exception as e:
        print(f"Error extracting text from {pdf_path}: {str(e)}")
        return None


def get_file_hash(filepath):
    """Generate hash of file for change detection."""
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()


def index_pdf(pdf_path):
    """Process and index a single PDF file."""
    filename = os.path.basename(pdf_path)
    file_hash = get_file_hash(pdf_path)

    # Check if already indexed with same hash
    existing = collection.get(
        where={"filename": filename}
    )

    if existing['ids']:
        # Check if file has changed
        existing_hash = existing['metadatas'][0].get('file_hash', '')
        if existing_hash == file_hash:
            print(f"✓ {filename} already indexed (unchanged)")
            return
        else:
            # File changed, remove old entries
            print(f"↻ {filename} has changed, re-indexing...")
            collection.delete(where={"filename": filename})

    print(f"📄 Processing {filename}...")

    # Extract text
    text = extract_text_from_pdf(pdf_path)
    if not text:
        print(f"✗ Failed to extract text from {filename}")
        return

    # Chunk text
    chunks = chunk_text(text)
    print(f"  → Split into {len(chunks)} chunks")

    # Generate embeddings
    embeddings = embedding_model.encode(chunks, show_progress_bar=False)

    # Prepare data for ChromaDB
    ids = [f"{filename}_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "filename": filename,
            "chunk_index": i,
            "file_hash": file_hash,
            "total_chunks": len(chunks)
        }
        for i in range(len(chunks))
    ]

    # Add to vector store
    collection.add(
        ids=ids,
        embeddings=embeddings.tolist(),
        documents=chunks,
        metadatas=metadatas
    )

    print(f"✓ {filename} indexed successfully ({len(chunks)} chunks)")


def index_all_pdfs():
    """Index all PDFs in the PDF folder."""
    # Create folders if they don't exist
    Path(PDF_FOLDER).mkdir(parents=True, exist_ok=True)
    Path(VECTOR_STORE_PATH).mkdir(parents=True, exist_ok=True)

    pdf_files = list(Path(PDF_FOLDER).glob("*.pdf"))

    if not pdf_files:
        print(f"\n⚠ No PDF files found in {PDF_FOLDER}")
        print(f"  Please add PDF files to this folder and restart the server.\n")
        return

    print(f"\n📚 Found {len(pdf_files)} PDF file(s)")
    print("=" * 50)

    for pdf_path in pdf_files:
        index_pdf(str(pdf_path))

    print("=" * 50)
    print(
        f"✓ Indexing complete! Total documents in store: {collection.count()}\n")


@app.route('/query', methods=['POST'])
def query_rag():
    """Query the RAG system for relevant context."""
    try:
        data = request.get_json()

        if 'query' not in data:
            return jsonify({'error': 'No query provided'}), 400

        query = data['query']
        top_k = data.get('top_k', TOP_K_RESULTS)

        # Generate query embedding
        query_embedding = embedding_model.encode([query])[0]

        # Search in vector store
        results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=top_k
        )

        # Format results and filter by relevance threshold
        contexts = []
        if results['documents'] and results['documents'][0]:
            for i, (doc, metadata, distance) in enumerate(zip(
                results['documents'][0],
                results['metadatas'][0],
                results['distances'][0]
            )):
                relevance_score = 1 - distance  # Convert distance to similarity

                # Only include results above relevance threshold
                if relevance_score >= RELEVANCE_THRESHOLD:
                    contexts.append({
                        'text': doc,
                        'source': metadata['filename'],
                        'chunk_index': metadata['chunk_index'],
                        'relevance_score': relevance_score
                    })

        # Combine contexts into a single string for LLM
        context_text = "\n\n".join([
            f"[Sumber: {ctx['source']}]\n{ctx['text']}"
            for ctx in contexts
        ])

        print(f"\n=== RAG Query ===")
        print(f"Query: {query}")
        print(
            f"Found {len(contexts)} relevant chunks (threshold: {RELEVANCE_THRESHOLD})")
        if contexts:
            print(
                f"Top source: {contexts[0]['source']} (relevance: {contexts[0]['relevance_score']:.3f})")
        else:
            print("No relevant context found - query not related to documents")
        print(f"=================\n")

        return jsonify({
            'success': True,
            'query': query,
            'context': context_text,
            'contexts': contexts,
            'has_context': len(contexts) > 0
        })

    except Exception as e:
        print(f"Error during RAG query: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/reindex', methods=['POST'])
def reindex():
    """Manually trigger re-indexing of all PDFs."""
    try:
        index_all_pdfs()
        return jsonify({
            'success': True,
            'message': 'Re-indexing completed',
            'total_documents': collection.count()
        })
    except Exception as e:
        print(f"Error during re-indexing: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/stats', methods=['GET'])
def stats():
    """Get statistics about indexed documents."""
    try:
        total_chunks = collection.count()

        # Get unique filenames
        if total_chunks > 0:
            all_data = collection.get()
            filenames = set(meta['filename'] for meta in all_data['metadatas'])
            files = list(filenames)
        else:
            files = []

        return jsonify({
            'success': True,
            'total_chunks': total_chunks,
            'total_files': len(files),
            'files': files,
            'model': 'paraphrase-multilingual-MiniLM-L12-v2',
            'chunk_size': CHUNK_SIZE,
            'chunk_overlap': CHUNK_OVERLAP
        })
    except Exception as e:
        print(f"Error getting stats: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'RAG Server',
        'model': 'paraphrase-multilingual-MiniLM-L12-v2',
        'vector_store': 'ChromaDB',
        'documents_indexed': collection.count()
    })


if __name__ == '__main__':
    print("\n🔍 RAG Server Starting...")
    print("Server will run on http://localhost:5003")
    print("=" * 50)

    # Index PDFs on startup
    index_all_pdfs()

    print("Endpoints:")
    print("  POST /query     - Query for relevant context")
    print("  POST /reindex   - Manually re-index all PDFs")
    print("  GET  /stats     - Get indexing statistics")
    print("  GET  /health    - Check server status")
    print("=" * 50)

    app.run(host='0.0.0.0', port=5003, debug=True)
