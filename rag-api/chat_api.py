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
        meta = {
            "channel": channel_name,
            "author": author_name,
            "timestamp": created_at.isoformat() if created_at else None,
            "thread_id": thread_id,
            "thread_name": thread_name,
            "file_url": file_url,
            "file_name": file_name
        }
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
    import time

    print("[INIT] Building embeddings and Pinecone vector store...")
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    pc = Pinecone(api_key=PINECONE_API_KEY)

    if PINECONE_INDEX in pc.list_indexes().names():
        print(f"[INIT] Deleting existing Pinecone index '{PINECONE_INDEX}'...")
        pc.delete_index(PINECONE_INDEX)
        while True:
            try:
                pc.describe_index(PINECONE_INDEX)
                time.sleep(1)
            except Exception as e:
                if "not found" in str(e).lower():
                    break
                else:
                    raise

    print(f"[INIT] Creating new Pinecone index '{PINECONE_INDEX}'...")
    pc.create_index(
        name=PINECONE_INDEX,
        dimension=3072,
        metric='cosine',
        spec=ServerlessSpec(cloud='aws', region='us-east-1')
    )
    print("[INIT] Index created. Uploading documents...")
    store = PineconeVectorStore.from_documents(
        documents=documents,
        embedding=embeddings,
        index_name=PINECONE_INDEX
    )
    print("[INIT] Vector store ready.")
    return store

def handle_incoming_message(data):
    # We can decide how to filter messages; for a DM to mr_robot, we do RAG
    channel_id = data.get("channelId")
    message_text = data.get("message", {}).get("content", "")
    author_id = data.get("message", {}).get("authorId")

    # We don't want to answer ourselves or empty content
    if not message_text.strip():
        return

    # Retrieve context
    docs = retriever.invoke(message_text)

    # Prepare the prompt
    template = PromptTemplate(
        template="{query} Context: {context}",
        input_variables=["query", "context"]
    )
    prompt_with_context = template.invoke({
        "query": message_text,
        "context": docs
    })

    # Query the LLM
    results = llm.invoke(prompt_with_context)
    answer = results.content.strip()

    # Generate a temporary message ID
    temp_message_id = f"temp_{int(time.time() * 1000)}"

    # Emit the response back via socket as a new message
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
                "name": "Mr. Robot"
            },
            "createdAt": datetime.datetime.now().isoformat()
        }
    }
    sio.emit("message", response_payload)
    print(f"[BOT] Replied with: {answer}")

@sio.event
def connect():
    print("[SOCKET] Connected to server as mr_robot")

@sio.event
def disconnect():
    print("[SOCKET] Disconnected from server")

@sio.on("message")
def on_message(data):
    # data is the inbound message payload. We'll handle here.
    # Basic check: do we want to respond to every message or only DMs to its channel containing the bot?
    # For simplicity, let's just call handle_incoming_message for all inbound messages.
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
    llm = ChatOpenAI(temperature=0.7, model_name="gpt-4o-mini")

    # 6) Connect to Socket.IO
    socket_url = os.getenv("SOCKET_SERVER_URL", "http://localhost:3001")
    secret = os.getenv("SOCKET_WEBHOOK_SECRET", "")
    try:
        print(f"[INIT] Connecting to socket server at {socket_url} as {bot_id}...")
        sio.connect(
            socket_url,
            auth={
                "token": secret,
                "type": "webhook",
                "userId": bot_id,
                "userName": "Mr. Robot"
            },
            transports=["websocket"],
            wait_timeout=10
        )
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
    