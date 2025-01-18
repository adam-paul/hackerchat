FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set Python to run in unbuffered mode
ENV PYTHONUNBUFFERED=1

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run the Python script with -u flag for unbuffered output
CMD ["python", "-u", "chat_api.py"]
