"""
Chainlit RAG app - COMPLETE FIXED VERSION
Better PDF chunking and diagnostics
Run with: chainlit run app.py -w
"""

import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import sys
import logging
from typing import List

from dotenv import load_dotenv
load_dotenv()

import chainlit as cl

# Standard imports
try:
    from langchain_community.document_loaders import PyPDFLoader
    from langchain_community.vectorstores import FAISS
    from langchain.text_splitting import RecursiveCharacterTextSplitter
    from langchain.schema import Document
    from langchain_huggingface import HuggingFaceEmbeddings
except Exception as e:
    raise RuntimeError(f"Missing langchain packages: {e}")

# Direct Groq API import
try:
    from groq import Groq
except Exception as e:
    raise RuntimeError(f"Missing groq package. Install: pip install groq. Error: {e}")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-groq")

# Configuration
PDF_FOLDER_PATH = "./fin_ed_docs"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# FIXED: Smaller chunks for better retrieval
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))  # characters
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))  # characters
TOP_K = int(os.getenv("TOP_K", "8"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.0"))

os.makedirs(PDF_FOLDER_PATH, exist_ok=True)

if not GROQ_API_KEY:
    logger.error("⚠️  GROQ_API_KEY not set!")
    sys.exit(1)

logger.info(f"✓ GROQ_API_KEY loaded: {GROQ_API_KEY[:20]}...")

# Initialize Groq client
groq_client = Groq(api_key=GROQ_API_KEY)
logger.info(f"✓ Groq client initialized")

# Document loader with DIAGNOSTIC logging
def load_and_process_pdfs(pdf_folder_path: str) -> List[Document]:
    """Load PDFs and split into chunks with diagnostics"""
    documents: List[Document] = []

    if not os.path.exists(pdf_folder_path):
        os.makedirs(pdf_folder_path, exist_ok=True)
        logger.warning(f"Created PDF folder: {pdf_folder_path}")
        return []

    pdf_files = [f for f in os.listdir(pdf_folder_path) if f.lower().endswith(".pdf")]
    
    if not pdf_files:
        logger.warning(f"No PDF files found in {pdf_folder_path}")
        return []

    logger.info(f"Loading {len(pdf_files)} PDFs from {pdf_folder_path}")
    
    for file in pdf_files:
        path = os.path.join(pdf_folder_path, file)
        try:
            loader = PyPDFLoader(path)
            loaded = loader.load()
            
            # Diagnostic: Check content
            total_chars = sum(len(doc.page_content) for doc in loaded)
            avg_chars = total_chars / len(loaded) if loaded else 0
            logger.info(f"  📄 {file}: {len(loaded)} pages, {total_chars:,} chars total (avg {avg_chars:.0f} chars/page)")
            
            # Add better metadata
            for d in loaded:
                d.metadata["source"] = file
                    
            documents.extend(loaded)
            logger.info(f"✓ Loaded: {file}")
            
        except Exception as e:
            logger.error(f"✗ Error loading {file}: {e}")

    if not documents:
        return []

    # Log overall stats
    total_chars = sum(len(doc.page_content) for doc in documents)
    avg_chars_per_page = total_chars / len(documents) if documents else 0
    logger.info(f"📊 Total: {len(documents)} pages, {total_chars:,} characters (avg {avg_chars_per_page:.0f} chars/page)")
    
    # Filter out nearly empty pages
    original_count = len(documents)
    documents = [doc for doc in documents if len(doc.page_content.strip()) > 50]
    if len(documents) < original_count:
        logger.info(f"🧹 Filtered out {original_count - len(documents)} empty/short pages")

    # Split into chunks
    logger.info(f"✂️  Splitting into chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
        length_function=len,
        is_separator_regex=False,
    )
    
    splits = splitter.split_documents(documents)
    
    if splits:
        avg_chunk_size = sum(len(s.page_content) for s in splits) / len(splits)
        chunks_per_page = len(splits) / len(documents) if documents else 0
        logger.info(f"✓ Created {len(splits)} chunks (avg {avg_chunk_size:.0f} chars/chunk, {chunks_per_page:.1f} chunks/page)")
        
        # Show sample chunk
        if len(splits) > 0:
            sample = splits[len(splits)//2].page_content[:200].replace('\n', ' ')
            logger.info(f"📝 Sample chunk: '{sample}...'")
    else:
        logger.error("❌ No chunks created! PDF might be scanned images or corrupted.")
    
    return splits

# Initialize components
logger.info("=" * 60)
logger.info("Initializing RAG System...")
logger.info("=" * 60)

logger.info("1️⃣  Loading embeddings model...")
try:
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    logger.info(f"✓ Loaded embeddings: {EMBEDDING_MODEL}")
except Exception as e:
    logger.error(f"✗ Failed to load embeddings: {e}")
    sys.exit(1)

logger.info(f"2️⃣  Loading PDFs from: {PDF_FOLDER_PATH}")
splits = []
try:
    splits = load_and_process_pdfs(PDF_FOLDER_PATH)
    if splits:
        logger.info(f"✓ Ready with {len(splits)} searchable chunks")
    else:
        logger.warning("⚠️  No documents loaded - add PDFs to ./fin_ed_docs/")
except Exception as e:
    logger.error(f"✗ Error processing PDFs: {e}")

logger.info("3️⃣  Building FAISS vectorstore...")
vectorstore = None
if splits:
    try:
        vectorstore = FAISS.from_documents(documents=splits, embedding=embeddings)
        logger.info(f"✓ Vectorstore created with {vectorstore.index.ntotal} vectors")
    except Exception as e:
        logger.error(f"✗ Failed to create vectorstore: {e}")

logger.info("=" * 60)
if vectorstore:
    logger.info("✅ RAG System Ready!")
else:
    logger.warning("⚠️  RAG System started but no documents loaded")
logger.info("=" * 60)

# Helper function to call Groq
def call_groq_api(messages: List[dict], max_tokens: int = 2048) -> str:
    """Call Groq API directly"""
    try:
        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=TEMPERATURE,
            max_tokens=max_tokens
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        raise

# Chainlit event handlers
@cl.on_chat_start
async def on_chat_start():
    """Initialize chat session"""
    
    welcome_msg = (
        "🚀 **Welcome to Science Learning Assistant**\n\n"
        f"📚 Model: {GROQ_MODEL}\n"
        f"🔍 Retrieval: Top {TOP_K} relevant chunks\n\n"
    )
    
    if vectorstore and vectorstore.index.ntotal > 0:
        welcome_msg += f"✅ **{vectorstore.index.ntotal} document chunks ready**\n\n"
        welcome_msg += "I can help you learn from your Grade 10 Science textbook! Try:\n"
        welcome_msg += "- *'What is a physical quantity?'*\n"
        welcome_msg += "- *'Explain photosynthesis'*\n"
        welcome_msg += "- *'What are Newton's laws of motion?'*\n"
        welcome_msg += "- *'Define ecosystem'*"
    else:
        welcome_msg += (
            "⚠️  **No documents loaded**\n\n"
            f"Please add PDF files to: `{PDF_FOLDER_PATH}/`\n"
            "Then restart with: `chainlit run app.py -w`"
        )
    
    await cl.Message(content=welcome_msg).send()
    
    # Initialize chat history
    cl.user_session.set("chat_history", [])
    logger.info("✓ Chat session initialized")

@cl.on_message
async def on_message(message: cl.Message):
    """Handle incoming messages"""
    
    if not vectorstore or vectorstore.index.ntotal == 0:
        await cl.Message(
            content="❌ No documents loaded. Please add PDFs to ./fin_ed_docs/ and restart the app."
        ).send()
        return

    # Show thinking indicator
    thinking = cl.Message(content="🔍 Searching through textbooks...")
    await thinking.send()

    try:
        # Retrieve relevant documents
        retriever = vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )
        
        docs = retriever.invoke(message.content)
        
        if not docs:
            await thinking.remove()
            await cl.Message(content="❌ No relevant content found in the textbooks.").send()
            return
        
        # Build context from documents
        context_parts = []
        elements = []
        
        for idx, doc in enumerate(docs):
            src_meta = doc.metadata or {}
            page = src_meta.get("page", "N/A")
            source_file = src_meta.get("source", "Unknown")
            content = doc.page_content or ""
            
            context_parts.append(
                f"[Source: {source_file}, Page {page}]\n{content}"
            )
            
            # Create side panel element
            elements.append(
                cl.Text(
                    content=f"**{source_file}** (Page {page})\n\n{content}",
                    name=f"ref_{idx+1}",
                    display="side",
                )
            )
        
        context = "\n\n---\n\n".join(context_parts)
        
        # Get chat history
        chat_history = cl.user_session.get("chat_history", [])
        
        # Build messages for Groq
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an expert educational AI tutor helping Grade 10 students learn Science and Technology. "
                    "Answer questions based ONLY on the provided textbook excerpts. "
                    "BE SPECIFIC: Use exact definitions, formulas, and examples from the text. "
                    "BE CLEAR: Explain in simple terms suitable for Grade 10 students. "
                    "BE HELPFUL: If related important information is in the context, mention it. "
                    "ALWAYS cite the page number from where you got the information. "
                    "If the exact information isn't provided, say 'Based on the excerpts provided, I cannot find this specific information.'"
                )
            }
        ]
        
        # Add recent chat history
        for msg in chat_history[-8:]:
            messages.append(msg)
        
        # Add current query with context
        messages.append({
            "role": "user",
            "content": f"Textbook excerpts:\n\n{context}\n\n---\n\nStudent's question: {message.content}\n\nProvide a clear answer with page citations:"
        })
        
        # Update thinking indicator
        await thinking.remove()
        thinking2 = cl.Message(content="💡 Generating answer...")
        await thinking2.send()
        
        # Call Groq API
        answer = call_groq_api(messages)
        
        # Update chat history
        chat_history.append({"role": "user", "content": message.content})
        chat_history.append({"role": "assistant", "content": answer})
        cl.user_session.set("chat_history", chat_history)
        
        # Remove thinking indicators
        try:
            await thinking.remove()
        except:
            pass
        try:
            await thinking2.remove()
        except:
            pass
        
        # Add source footer
        if elements:
            answer += f"\n\n---\n📖 **References**: {len(elements)} excerpts (see side panel for full text)"
        
        # Send response
        await cl.Message(content=answer, elements=elements).send()
        
        logger.info(f"✓ Answered query with {len(docs)} sources")

    except Exception as e:
        logger.exception("Error handling message")
        
        try:
            await thinking.remove()
        except:
            pass
        try:
            await thinking2.remove()
        except:
            pass
            
        await cl.Message(
            content=f"❌ Sorry, I encountered an error: {str(e)}\n\nPlease try rephrasing your question."
        ).send()

@cl.on_chat_end
async def on_chat_end():
    """Clean up on chat end"""
    logger.info("Chat session ended")