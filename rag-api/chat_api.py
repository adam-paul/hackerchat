#!/usr/bin/env python3

import os
import sys
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

# LangChain & Pinecone imports
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts.prompt import PromptTemplate

# Initialize FastAPI app
app = FastAPI(title="HackerChat RAG API")

# -------------------------------------------
# 0. Load environment variables
# -------------------------------------------
load_dotenv()

# Required environment variables - will raise error if not set
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
LANGCHAIN_API_KEY = os.environ["LANGCHAIN_API_KEY"]
PINECONE_INDEX = os.environ["PINECONE_INDEX"]
DATABASE_URL = os.environ["DATABASE_URL"]

# Optional environment variables with defaults
LANGCHAIN_TRACING_V2 = os.getenv("LANGCHAIN_TRACING_V2", "false")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "MyLangChainProject")
PINECONE_ENV = os.getenv("PINECONE_ENV", "us-west1-gcp")

# Set environment variables for LangChain
os.environ["LANGCHAIN_TRACING_V2"] = LANGCHAIN_TRACING_V2
os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT

# Global vectorstore instance and initialization flag
vectorstore = None
is_initialized = False

# -------------------------------------------
# 1. Fetch messages from the Postgres database
# -------------------------------------------
def fetch_messages_from_db():
    """
    Fetch messages from the database using the Prisma schema structure.
    Returns a list of (content, channel_name, author_name, timestamp).
    """
    try:
        print(f"Attempting to connect to database...")
        conn = psycopg2.connect(DATABASE_URL)
        print("Successfully connected to database")
        
        cursor = conn.cursor()
        
        # Join with channels and users to get the readable names
        query = """
            SELECT 
                COALESCE(m.content, '') as content,
                c.name as channel_name,
                u.name as author_name,
                m."createdAt",
                m."threadId",
                m."threadName",
                m."fileUrl",
                m."fileName"
            FROM "Message" m
            JOIN "Channel" c ON m."channelId" = c.id
            JOIN users u ON m."authorId" = u.id
            ORDER BY m."createdAt" DESC
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        print(f"Retrieved {len(rows)} messages from database")
        return rows

    except Exception as e:
        print(f"[ERROR] Could not fetch messages: {e}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()

# -------------------------------------------
# 2. Convert DB rows into LangChain Documents
# -------------------------------------------
def create_documents_from_messages(rows):
    """Convert each message row into a LangChain Document object."""
    print(f"Converting {len(rows)} messages to documents")
    documents = []
    for (content, channel_name, author_name, created_at, thread_id, thread_name, file_url, file_name) in rows:
        text_content = content if content else ""
        if not text_content.strip() and not file_url:
            continue
        
        # Clean metadata to avoid null values
        meta = {
            "channel": channel_name or "",
            "author": author_name or "",
            "timestamp": created_at.isoformat() if created_at else "",
            "thread_id": thread_id or "",
            "thread_name": thread_name or "",
            "file_url": file_url or "",
            "file_name": file_name or ""
        }
        
        if file_url:
            text_content += f"\n[Attached file: {file_name or 'unnamed file'}]"
            
        documents.append(Document(page_content=text_content, metadata=meta))
    return documents

# -------------------------------------------
# 3. Split documents into chunks
# -------------------------------------------
def split_documents(documents, chunk_size=1000, chunk_overlap=100):
    print(f"Splitting {len(documents)} documents into chunks")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap
    )
    return text_splitter.split_documents(documents)

# -------------------------------------------
# 4. Create or load Pinecone vector store
# -------------------------------------------
def create_or_load_vectorstore(documents):
    """Initialize Pinecone and create vector store."""
    from pinecone import Pinecone, ServerlessSpec
    import time

    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    pc = Pinecone(api_key=PINECONE_API_KEY)

    # Delete and recreate index
    if PINECONE_INDEX in pc.list_indexes().names():
        print(f"Deleting existing index {PINECONE_INDEX}...")
        pc.delete_index(PINECONE_INDEX)
        while True:
            try:
                pc.describe_index(PINECONE_INDEX)
                time.sleep(1)
            except Exception as e:
                if "not found" in str(e).lower():
                    break
                raise e

    print(f"Creating new index {PINECONE_INDEX}...")
    pc.create_index(
        name=PINECONE_INDEX,
        dimension=3072,
        metric='cosine',
        spec=ServerlessSpec(
            cloud='aws',
            region='us-east-1'
        )
    )

    print(f"Creating Pinecone vectorstore...")
    return PineconeVectorStore.from_documents(
        documents=documents,
        embedding=embeddings,
        index_name=PINECONE_INDEX
    )

# -------------------------------------------
# 5. API Models
# -------------------------------------------
class AskRequest(BaseModel):
    question: str

class DocumentInfo(BaseModel):
    channel: 'str | None'
    author: 'str | None'
    timestamp: 'str | None'
    thread_id: 'str | None' = None
    thread_name: 'str | None' = None

class AskResponse(BaseModel):
    answer: str
    retrieved_docs: 'list[DocumentInfo]'

# -------------------------------------------
# 6. FastAPI Routes and Startup
# -------------------------------------------
@app.on_event("startup")
async def startup_event():
    """Initialize the vector store on startup."""
    global vectorstore, is_initialized
    try:
        print("Initializing vector store...")
        rows = fetch_messages_from_db()
        documents = create_documents_from_messages(rows)
        chunked_docs = split_documents(documents)
        vectorstore = create_or_load_vectorstore(chunked_docs)
        is_initialized = True
        print("Vector store initialization complete")
    except Exception as e:
        print(f"Failed to initialize vector store: {e}")
        raise

@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(req_body: AskRequest):
    """Handle questions about chat history."""
    global vectorstore, is_initialized
    
    if not is_initialized:
        raise HTTPException(status_code=503, detail="Server is still initializing")
    
    # 1) Retrieve from vector store
    retriever = vectorstore.as_retriever()
    docs = retriever.invoke(req_body.question)

    # 2) Format prompt with retrieved context
    template = PromptTemplate(
        template="{query} Context: {context}",
        input_variables=["query", "context"]
    )
    prompt_with_context = template.invoke({
        "query": req_body.question,
        "context": docs
    })

    # 3) Get LLM response
    llm = ChatOpenAI(temperature=0.7, model_name="gpt-4o-mini")
    llm_response = llm.invoke(prompt_with_context)

    # 4) Format and return response
    return AskResponse(
        answer=llm_response.content,
        retrieved_docs=[
            DocumentInfo(
                channel=d.metadata.get("channel"),
                author=d.metadata.get("author"),
                timestamp=d.metadata.get("timestamp"),
                thread_id=d.metadata.get("thread_id"),
                thread_name=d.metadata.get("thread_name")
            ) for d in docs
        ]
    )

@app.get("/health")
async def health_check():
    """Simple health check endpoint that also reports initialization status."""
    return {
        "status": "healthy",
        "initialized": is_initialized
    }

