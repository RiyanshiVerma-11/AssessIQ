FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV, Mediapipe, and bcrypt
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Ignore any host or image-level pip config so dependency installs stay predictable.
ENV PIP_CONFIG_FILE=/dev/null \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_REQUIRE_HASH=0 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

# Copy the entire project first
COPY . .

# Upgrade pip and install python dependencies
RUN python -m pip install --upgrade pip setuptools wheel
RUN python -m pip install --no-cache-dir --retries 10 --timeout 120 -r backend/requirements.txt

# Expose port 8085 to avoid conflicts with other containers
EXPOSE 8085

# Run the app
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8085", "--reload"]
