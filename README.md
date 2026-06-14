# AssessIQ - Intelligent Examination Platform

AssessIQ is a modern, AI-powered examination platform designed to provide dynamic assessments and ensure academic integrity. It leverages advanced AI models for generating questions, auto-grading subjective answers, and real-time proctoring.

## Features

- **Dynamic Question Generation**: Automatically generates unique exam questions across various topics and difficulty levels using the Groq API (Llama 3).
- **AI Auto-Grading**: Evaluates subjective, essay-type answers and provides a score out of 10 along with constructive feedback.
- **Real-Time Proctoring**: Client-side analysis using MediaPipe (Face Mesh) and Coco-SSD to detect suspicious behavior directly in the browser, minimizing server load. Utilizes WebSockets to relay lightweight alert payloads to the backend.
- **Full-Stack Architecture**: Built with a robust FastAPI backend and a responsive HTML/CSS/JS frontend.
- **Containerized**: Fully dockerized setup for easy deployment using Docker Compose.

## ⚙️ Core Architecture & Scalability

```mermaid
graph TD
    subgraph Client [Frontend / Examinee Browser]
        UI[Vanilla HTML/JS/CSS UI]
        Cam[MediaPipe Face Mesh]
        Coco[Coco-SSD Phone Detection]
        UI --- Cam
        UI --- Coco
    end

    subgraph Server [Backend / FastAPI]
        API[REST API Endpoints]
        WS[WebSocket Manager]
        LLM[Groq LLaMA 3 Integration]
        DB[(SQLite with WAL)]
        
        API <--> LLM
        API <--> DB
        WS <--> DB
    end

    Client -- "HTTP Requests (Exam Data)" --> API
    Client -- "WebSocket Alerts" --> WS
```

**Frontend**: HTML/JS/CSS (Vanilla) with Chart.js for visualization.
**Backend**: FastAPI, SQLite, WebSockets for lightweight, real-time alerting.
**AI Integration**: Groq API (Llama 3 models) for instantaneous question generation and subjective grading.

> **Note on Architecture:** For the Hackathon MVP, we are utilizing FastAPI's native `BackgroundTasks` and in-memory LRU caching (`functools`) to guarantee sub-50ms API responses without the deployment overhead of extra containers. In a production environment, this architecture is fully decoupled and ready to scale using **Redis** for distributed caching and **Celery/BullMQ** for asynchronous AI job queues.
## Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: SQLite with SQLAlchemy ORM
- **Authentication**: JWT authentication with Passlib (Argon2)
- **AI Integrations**: Groq API (Llama-3 models)
- **Computer Vision**: OpenCV, MediaPipe
- **Real-time Communication**: WebSockets

### Frontend
- HTML5, CSS3, Vanilla JavaScript

### Deployment
- Docker, Docker Compose

## Prerequisites

Before you begin, ensure you have met the following requirements:
- Python 3.11+ (if running locally without Docker)
- Docker and Docker Compose (for containerized deployment)
- A Groq API Key for AI features

## Getting Started

### Environment Variables

Create a `.env` file in the `backend/` directory based on the provided `.env.example`:

```env
# AI Model API Keys
GEMINI_API_KEY=your_gemini_api_key_here
GROK_API_KEY=your_groq_api_key_here

# Database Configuration
DATABASE_URL=sqlite:///./assessiq.db

# App Settings
SECRET_KEY=your_secret_key_here
DEBUG=True
```

*Note: The project primarily uses `GROK_API_KEY` for Groq integrations.*

### Running with Docker (Recommended)

The easiest way to run AssessIQ is using Docker Compose. This will build both the frontend and backend into a single container and expose the necessary ports.

1. Ensure Docker is running on your machine.
2. Build and start the container:
   ```bash
   docker-compose up -d --build
   ```
3. The application will be available at: `http://localhost:8085`

### Running Locally (Without Docker)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Initialize the database with mock data:
   ```bash
   python init_db.py
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8085 --reload
   ```
5. The application will be available at: `http://localhost:8085` (The frontend is served directly by the FastAPI backend).

## API Endpoints

- `GET /api/status`: Check the status of the API.
- `POST /api/auth/login`: Authenticate user and receive JWT token.
- `POST /api/auth/register`: Register a new user account.
- `GET /api/exams`: Retrieve a list of all available exams.
- `GET /api/questions?topic={topic}&difficulty={difficulty}`: Generate exam questions dynamically.
- `POST /api/grade`: Auto-grade subjective and essay-type answers.
- `POST /api/exam/start`: Start an exam session.
- `POST /api/exam/autosave`: Autosave exam answers.
- `POST /api/exam/terminate`: Terminate an exam due to security violations.
- `WS /ws/proctoring`: WebSocket endpoint for real-time video frame analysis.

## Project Structure

```
.
├── backend/
│   ├── .env.example        # Example environment variables
│   ├── auth.py             # JWT authentication and user management
│   ├── config.py           # Application configuration settings
│   ├── database.py         # Database connection setup
│   ├── grading.py          # AI auto-grading and question generation logic
│   ├── init_db.py          # Script to initialize database with mock data
│   ├── main.py             # FastAPI entry point and routing
│   ├── models.py           # SQLAlchemy database models
│   ├── proctoring.py       # Computer vision logic for proctoring
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── app.js              # Frontend logic
│   ├── index.html          # Main web interface
│   └── styles.css          # UI styling
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Docker image definition
└── test_groq.py            # Test script for Groq API integration
```

## License

This project is open-source and available under the [MIT License](LICENSE).
