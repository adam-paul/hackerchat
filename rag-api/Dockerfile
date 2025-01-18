FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port 8000 for FastAPI
EXPOSE 8000

# Run the FastAPI server
CMD ["uvicorn", "chat_api:app", "--host", "0.0.0.0", "--port", "8000"]
