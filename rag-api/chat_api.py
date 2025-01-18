#!/usr/bin/env python3

import os
import sys
import psycopg2
from dotenv import load_dotenv
import socketio
from uuid import uuid4
from datetime import datetime
import traceback

# LangChain & Pinecone imports
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts.prompt import PromptTemplate

# Initialize Socket.IO client
sio = socketio.Client(logger=True, engineio_logger=True)

# -------------------------------------------
# 0. Load environment variables
# -------------------------------------------
load_dotenv()

# Required environment variables - will raise error if not set
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
LANGCHAIN_API_KEY = os.environ["LANGCHAIN_API_KEY"]
PINECONE_INDEX = os.environ["PINECONE_INDEX"]
DATABASE_URL = os.environ["DATABASE_URL"]
SOCKET_WEBHOOK_SECRET = os.environ["SOCKET_WEBHOOK_SECRET"]

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
    print(f"[SOCKET] Bot {bot_id} ready for DM connections")

@sio.event
def disconnect():
    print("[SOCKET] Disconnected from socket server")
    # Try to reconnect
    try:
        print("[SOCKET] Attempting to reconnect...")
        socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
        sio.connect(socket_url, 
                   auth={
                       "token": SOCKET_WEBHOOK_SECRET,
                       "type": "webhook",
                       "userId": bot_id,
                       "userName": "Mr. Robot"
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
def channel_created(data):
    """Handle new channel creation - join if we're a participant."""
    print(f"[SOCKET] Channel created: {data}")
    try:
        channel = data.get('channel', {})
        if channel.get('type') == 'DM':
            participants = channel.get('participants', [])
            # Check if we're a participant
            if any(p.get('id') == bot_id for p in participants):
                channel_id = channel.get('id')
                print(f"[SOCKET] Joining DM channel: {channel_id}")
                sio.emit('join-channel', channel_id)
    except Exception as e:
        print(f"[SOCKET] Error handling channel creation: {e}")

@sio.event
def message(data):
    """Handle incoming messages."""
    print(f"[SOCKET] Received message event: {data}")
    
    try:
        # Extract message data - handle both direct messages and message events
        message = data.get('message', data)
        
        # Validate message structure
        if not isinstance(message, dict):
            print(f"[SOCKET] Invalid message format: {message}")
            return
            
        channel_id = message.get('channelId')
        content = message.get('content', '')
        author = message.get('author', {})
        author_id = author.get('id', '')
        
        print(f"[SOCKET] Processing message: channel={channel_id}, author={author_id}, content={content}")
        
        # Only respond to user messages, not our own
        if author_id and author_id != bot_id:
            # Generate response using the RAG system
            try:
                print(f"[SOCKET] Generating response for message: {content}")
                # Use the existing vectorstore to get context and generate response
                retriever = vectorstore.as_retriever()
                docs = retriever.invoke(content)
                
                template = PromptTemplate(
                    template="{query} Context: {context}",
                    input_variables=["query", "context"]
                )
                prompt_with_context = template.invoke({
                    "query": content,
                    "context": docs
                })
                
                llm = ChatOpenAI(temperature=0.7, model_name="gpt-4-mini")
                llm_response = llm.invoke(prompt_with_context)
                
                # Send response through socket
                message_id = f"msg_{uuid4()}"
                now = datetime.utcnow().isoformat()
                
                # Format message according to the MessageEvent type
                message_event = {
                    'type': 'message',
                    'channelId': channel_id,
                    'messageId': message_id,
                    'message': {
                        'id': message_id,
                        'content': llm_response.content,
                        'channelId': channel_id,
                        'createdAt': now,
                        'author': {
                            'id': bot_id,
                            'name': "Mr. Robot",
                            'imageUrl': None
                        },
                        'reactions': []  # Required by Message type
                    }
                }
                
                print(f"[SOCKET] Sending response: {message_event}")
                sio.emit('message', message_event)
                
            except Exception as e:
                print(f"[SOCKET] Error generating/sending response: {e}")
                print(f"[SOCKET] Error details:", {
                    'error': str(e),
                    'type': type(e).__name__,
                    'trace': traceback.format_exc()
                })
    except Exception as e:
        print(f"[SOCKET] Error processing message: {e}")
        print(f"[SOCKET] Error details:", {
            'error': str(e),
            'type': type(e).__name__,
            'trace': traceback.format_exc()
        })

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
# Main initialization and startup
# -------------------------------------------
def main():
    """Initialize the vector store and socket connection."""
    global vectorstore, is_initialized
    
    try:
        print("[INIT] Starting initialization...")
        rows = fetch_messages_from_db()
        documents = create_documents_from_messages(rows)
        chunked_docs = split_documents(documents)
        vectorstore = create_or_load_vectorstore(chunked_docs)
        
        # Connect to socket server
        socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
        print(f"[SOCKET] Attempting connection to socket server at {socket_url}...")
        
        sio.connect(
            socket_url,
            auth={
                "token": SOCKET_WEBHOOK_SECRET,
                "type": "webhook",
                "userId": bot_id,
                "userName": "Mr. Robot"
            },
            transports=['websocket'],
            wait_timeout=10
        )
        
        is_initialized = True
        print("[INIT] Initialization complete")
        
        # Keep the main thread running
        import signal
        def signal_handler(sig, frame):
            if sio.connected:
                sio.disconnect()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Block main thread
        signal.pause()
        
    except Exception as e:
        print(f"[INIT] Failed to initialize: {e}")
        if sio.connected:
            sio.disconnect()
        sys.exit(1)

if __name__ == "__main__":
    main()

