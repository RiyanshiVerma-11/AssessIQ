FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and Mediapipe
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the entire project (frontend + backend)
COPY . .

# Expose port 8085 to avoid conflicts with other containers
EXPOSE 8085

# Run the app
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8085", "--workers", "4"]
