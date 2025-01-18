#!/usr/bin/env python3

import os
import sys
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
import socketio
from uuid import uuid4
from datetime import datetime

# LangChain & Pinecone imports
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts.prompt import PromptTemplate

# Initialize FastAPI app and Socket.IO client
app = FastAPI(title="HackerChat RAG API")
sio = socketio.Client(logger=True, engineio_logger=True)  # Enable logging

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

# Global variables
vectorstore = None
is_initialized = False
initialization_lock = None
bot_id = "bot_mr_robot"  # This should match what was created by create_robot.py

# Socket.IO event handlers
@sio.event
def connect():
    print("[SOCKET] Connected to socket server")
    # Join the bot's channels
    sio.emit('join-channel', bot_id)
    print(f"[SOCKET] Bot {bot_id} joined its channel")

@sio.event
def disconnect():
    print("[SOCKET] Disconnected from socket server")
    # Try to reconnect
    try:
        print("[SOCKET] Attempting to reconnect...")
        socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
        sio.connect(socket_url, 
                   auth={
                       "userId": bot_id,
                       "userName": "Mr. Robot",
                       "imageUrl": None
                   },
                   transports=['websocket'],
                   wait_timeout=10)
    except Exception as e:
        print(f"[SOCKET] Reconnection failed: {e}")

@sio.event
def connect_error(data):
    print(f"[SOCKET] Connection error: {data}")
    print("[SOCKET] Current socket state:", {
        "connected": sio.connected,
        "transport": sio.transport(),
        "sid": sio.sid
    })

@sio.event
def message(data):
    print(f"[SOCKET] Received message: {data}")

@sio.event
def message_delivered(data):
    print(f"[SOCKET] Message delivered: {data}")

@sio.event
def message_error(data):
    print(f"[SOCKET] Message error: {data}")

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
    """Initialize the vector store and socket connection on startup."""
    global vectorstore, is_initialized, initialization_lock
    from asyncio import Lock
    
    # Create the lock
    initialization_lock = Lock()
    
    # Run initialization
    async with initialization_lock:
        try:
            print("[INIT] Starting initialization...")
            rows = fetch_messages_from_db()
            documents = create_documents_from_messages(rows)
            chunked_docs = split_documents(documents)
            vectorstore = create_or_load_vectorstore(chunked_docs)
            
            # Connect to socket server
            try:
                socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
                print(f"[SOCKET] Attempting connection to socket server at {socket_url}...")
                
                # Configure socket connection
                sio.connect(
                    socket_url,
                    auth={
                        "userId": bot_id,
                        "userName": "Mr. Robot",
                        "imageUrl": None
                    },
                    transports=['websocket'],  # Force websocket transport
                    wait_timeout=10,  # Increase timeout
                    wait=True  # Wait for connection to be established
                )
                print("[SOCKET] Successfully connected to socket server")
                print("[SOCKET] Connection details:", {
                    "transport": sio.transport(),
                    "sid": sio.sid
                })
            except Exception as e:
                print(f"[SOCKET] Failed to connect to socket server: {e}")
                print("[SOCKET] Connection state:", {
                    "connected": sio.connected,
                    "transport": sio.transport() if sio.connected else None
                })
                # Don't raise here - we can still function without real-time updates
            
            is_initialized = True
            print("[INIT] Initialization complete")
        except Exception as e:
            print(f"[INIT] Failed to initialize: {e}")
            raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    if sio.connected:
        sio.disconnect()

@app.post("/ask", response_model=AskResponse)
async def ask_endpoint(req_body: AskRequest):
    """Handle questions about chat history."""
    global vectorstore, is_initialized, initialization_lock
    
    if not is_initialized:
        if initialization_lock:
            async with initialization_lock:
                if not is_initialized:
                    raise HTTPException(status_code=503, detail="Server is still initializing")
        else:
            raise HTTPException(status_code=503, detail="Server initialization failed")
    
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
    
    # 4) If we're connected to the socket server, send the response in real-time
    if sio.connected:
        message_id = f"msg_{uuid4()}"
        now = datetime.utcnow().isoformat()
        print(f"[SOCKET] Sending message {message_id}")
        
        message_event = {
            'type': 'message',
            'messageId': message_id,
            'channelId': req_body.channelId,
            'message': {
                'id': message_id,
                'content': llm_response.content,
                'channelId': req_body.channelId,
                'createdAt': now,
                'author': {
                    'id': bot_id,
                    'name': "Mr. Robot",
                    'imageUrl': None
                }
            }
        }
        print(f"[SOCKET] Message event: {message_event}")
        sio.emit('message', message_event)

    # 5) Return response
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
        "initialized": is_initialized,
        "socket_connected": sio.connected
    }

