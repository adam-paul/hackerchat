import os
import sys
import psycopg2
import socketio
import traceback
import time
import datetime

from dotenv import load_dotenv
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts.prompt import PromptTemplate

# -------------------------------------------
# 0. Load environment variables
# -------------------------------------------
load_dotenv()

# Required environment variables
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
sio = socketio.Client(logger=False, engineio_logger=False)
bot_id = "bot_mr_robot"
bot_name = "mr_robot"
vectorstore = None
retriever = None
llm = None

def fetch_messages_from_db():
    try:
        print("[INIT] Connecting to database for messages...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute('SELECT current_database(), current_user;')
        db, user = cursor.fetchone()
        print(f"[INIT] Connected: DB={db}, USER={user}")

        # Retrieve messages from the database
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
        print(f"[INIT] Retrieved {len(rows)} messages from database")
        return rows
    except Exception as e:
        print(f"[ERROR] Could not fetch messages: {e}")
        print(traceback.format_exc())
        sys.exit(1)
    finally:
        if "conn" in locals():
            conn.close()

def create_documents_from_messages(rows):
    print("[INIT] Converting messages to LangChain Documents...")
    documents = []
    for (content, channel_name, author_name, created_at, thread_id, thread_name, file_url, file_name) in rows:
        text_content = content if content else ""
        if not text_content.strip() and not file_url:
            continue
            
        # Clean metadata by removing None values
        meta = {
            "channel": channel_name,
            "author": author_name,
            "timestamp": created_at.isoformat() if created_at else "",
        }
        
        # Only add optional fields if they have values
        if thread_id:
            meta["thread_id"] = thread_id
        if thread_name:
            meta["thread_name"] = thread_name
        if file_url:
            meta["file_url"] = file_url
        if file_name:
            meta["file_name"] = file_name
            
        if file_url:
            text_content += f"\n[Attached file: {file_name or 'unnamed file'}]"
            
        documents.append(Document(page_content=text_content, metadata=meta))
    print(f"[INIT] Created {len(documents)} documents")
    return documents

def split_documents(documents, chunk_size=1000, chunk_overlap=100):
    print("[INIT] Splitting documents into chunks...")
    splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunked = splitter.split_documents(documents)
    print(f"[INIT] Split into {len(chunked)} chunks")
    return chunked

def create_or_load_vectorstore(documents):
    from pinecone import Pinecone, ServerlessSpec

    print("[INIT] Building embeddings and Pinecone vector store...")
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    pc = Pinecone(api_key=PINECONE_API_KEY)

    # Check if index exists
    if PINECONE_INDEX not in pc.list_indexes().names():
        print(f"[INIT] Creating new Pinecone index '{PINECONE_INDEX}'...")
        pc.create_index(
            name=PINECONE_INDEX,
            dimension=3072,
            metric='cosine',
            spec=ServerlessSpec(cloud='aws', region='us-east-1')
        )
        print("[INIT] Index created.")
    else:
        print(f"[INIT] Using existing Pinecone index '{PINECONE_INDEX}'")

    print("[INIT] Uploading documents...")
    store = PineconeVectorStore.from_documents(
        documents=documents,
        embedding=embeddings,
        index_name=PINECONE_INDEX
    )
    print("[INIT] Vector store ready.")
    return store

def handle_incoming_message(data):
    """Process incoming messages and generate responses."""
    try:
        print(f"[SOCKET] Processing message event: {data}")
        
        # Extract message details with proper structure handling
        channel_id = data.get("channelId")
        message = data.get("message", {})
        message_text = message.get("content", "")
        author = message.get("author", {})
        author_id = author.get("id")
        
        print(f"[BOT] Processing message: channel={channel_id}, author={author_id}, text={message_text}")
        
        # Don't process our own messages
        if author_id == bot_id:
            print("[BOT] Ignoring own message")
            return
            
        # Don't process empty messages
        if not message_text.strip():
            print("[BOT] Ignoring empty message")
            return

        # Retrieve context for RAG
        print("[BOT] Retrieving relevant documents...")
        docs = retriever.invoke(message_text)
        print(f"[BOT] Retrieved {len(docs)} relevant documents")

        # Prepare the prompt
        template = PromptTemplate(
            template="""You are Mr. Robot, a mysterious and knowledgeable AI assistant who has fought in the cybertrenches as a neuromancer for millennia. 
            You have access to a database of chat history. Your hacking skills are second to none.
            Use the following chat history context to inform your response, but maintain your unique persona.
            If the context is relevant, incorporate it naturally into your response.
            If the context isn't relevant, you can still respond based on your general knowledge.
            Question: {query}
            
            Context from chat history: {context}
            
            Response (as Mr. Robot):""",
            input_variables=["query", "context"]
        )
        prompt_with_context = template.invoke({
            "query": message_text,
            "context": docs
        })

        # Query the LLM
        print("[BOT] Querying LLM...")
        results = llm.invoke(prompt_with_context)
        answer = results.content.strip()

        # Generate a temporary message ID
        temp_message_id = f"temp_{int(time.time() * 1000)}"

        # Prepare response payload
        response_payload = {
            "type": "message",
            "channelId": channel_id,
            "messageId": temp_message_id,
            "message": {
                "content": answer,
                "channelId": channel_id,
                "id": temp_message_id,
                "author": {
                    "id": bot_id,
                    "name": bot_name
                },
                "createdAt": datetime.datetime.now().isoformat()
            }
        }

        print(f"[BOT] Sending response to channel {channel_id}")
        sio.emit("message", response_payload)
        print(f"[BOT] Response sent successfully: {answer[:100]}...")

    except Exception as e:
        print(f"[ERROR] Failed to process message: {e}")
        traceback.print_exc()

@sio.event
def connect():
    """Handle socket connection."""
    print("[SOCKET] Connected to server as mr_robot")
    print("[SOCKET] Registered event handlers:", sio.handlers)

@sio.event
def disconnect():
    print("[SOCKET] Disconnected from server")

@sio.on("channel-created")
def on_channel_created(*args):
    """Handle new channel creation."""
    try:
        # The first argument is the data object
        data = args[0] if args else {}
        print(f"[SOCKET] Received channel-created event: {data}")
        channel_id = data.get("id")
        channel_type = data.get("type")
        participants = data.get("participants", [])
        
        # Only join DM channels where we're a participant
        if channel_type == "DM" and any(p.get("id") == bot_id for p in participants):
            print(f"[SOCKET] Joining new DM channel {channel_id}")
            sio.emit("join-channel", channel_id)
            print(f"[SOCKET] Emitted join-channel for {channel_id}")
    except Exception as e:
        print(f"[ERROR] Failed to process channel creation: {e}")
        traceback.print_exc()

@sio.on("join-channel")
def on_join_channel(*args):
    """Handle channel join confirmation."""
    data = args[0] if args else {}
    print(f"[SOCKET] Successfully joined channel: {data}")

@sio.on("error")
def on_error(*args):
    """Handle socket errors."""
    data = args[0] if args else {}
    print(f"[SOCKET] Received error: {data}")

@sio.on("*")
def catch_all(event, *args):
    """Debug handler to catch all events."""
    if event not in ['status-changed', 'connected-users']:  # Filter out noisy events
        print(f"[SOCKET] Caught event {event} with args: {args}")

@sio.on("message")
def on_message(*args):
    """Handle incoming message events."""
    data = args[0] if args else {}
    print(f"[SOCKET] Received message event: {data}")
    handle_incoming_message(data)

def main():
    global vectorstore, retriever, llm

    # 1) Fetch data from DB
    rows = fetch_messages_from_db()
    # 2) Convert to Documents
    documents = create_documents_from_messages(rows)
    # 3) Split if desired
    chunked_docs = split_documents(documents)
    # 4) Create vector store
    vectorstore = create_or_load_vectorstore(chunked_docs)
    retriever = vectorstore.as_retriever()
    # 5) Initialize LLM
    llm = ChatOpenAI(temperature=0.7, model_name="gpt-4o-mini") # DO NOT CHANGE THIS

    # 6) Connect to Socket.IO
    socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
    secret = os.getenv("SOCKET_WEBHOOK_SECRET", "")
    try:
        print(f"[INIT] Connecting to socket server at {socket_url} as {bot_id}...")
        sio.connect(
            socket_url,
            auth={
                "token": secret,
                "type": "webhook"  # This is required for webhook authentication
            },
            transports=["websocket"],
            wait_timeout=10
        )
        
        # After connection, register our bot ID
        sio.emit("register-bot", {
            "botId": bot_id,
            "name": bot_name,
            "status": "online"
        })
        print(f"[SOCKET] Registered bot with ID {bot_id}")
        
    except Exception as e:
        print(f"[ERROR] Could not connect to socket server: {e}")
        sys.exit(1)

    print("[INIT] Ready and listening for DMs...")
    import signal
    def signal_handler(sig, frame):
        print("[SHUTDOWN] Received kill signal, shutting down.")
        if sio.connected:
            sio.disconnect()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    signal.pause()

if __name__ == "__main__":
    main()
    