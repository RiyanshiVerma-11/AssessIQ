import json
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Response, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
import models, database, proctoring, grading, init_db
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=database.engine)
    db = database.SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            try:
                init_db.seed_data(db)
            except IntegrityError:
                db.rollback()
    finally:
        db.close()
    yield

app = FastAPI(title="Intelligent Examination Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

class GradeRequest(BaseModel):
    session_id: int
    question: str = Field(..., max_length=1000)
    answer: str = Field(..., max_length=5000)

@app.get("/api/status")
def read_root():
    return {"message": "Intelligent Examinations API is running"}

@app.get("/api/exams")
def get_exams(db: Session = Depends(get_db)):
    exams = db.query(models.Exam).all()
    # Format exams for the frontend
    result = []
    for exam in exams:
        questions = db.query(models.Question).filter(models.Question.exam_id == exam.id).all()
        q_list = [{"id": q.id, "text": q.text, "type": q.answer_type} for q in questions]
        result.append({
            "id": exam.id,
            "title": exam.title,
            "description": exam.description,
            "registered": 48, # Mock values to prevent 'undefined' on dashboard
            "completed": 45,
            "avgScore": 82,
            "status": "Active",
            "duration": 45,
            "questionsCount": len(q_list),
            "questions": q_list
        })
    return {"exams": result}

@app.get("/api/questions")
def get_questions(response: Response, topic: str = "Computer Science", difficulty: str = "medium"):
    # Pydantic-like validation manually or just let FastAPI handle string validation
    if len(topic) > 200:
        return {"error": "Topic too long"}
        
    hits_before = grading.generate_questions.cache_info().hits
    questions = grading.generate_questions(topic, difficulty)
    hits_after = grading.generate_questions.cache_info().hits
    
    if hits_after > hits_before:
        response.headers["X-Cache-Status"] = "HIT"
    else:
        response.headers["X-Cache-Status"] = "MISS"
        
    return {"questions": questions}

@app.post("/api/grade")
def grade_answer(req: GradeRequest, db: Session = Depends(get_db)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if not session or session.status == "TERMINATED":
        return {"score": 0, "feedback": "Evaluation blocked. Exam was terminated due to security violations."}
    result = grading.auto_grade_answer(req.question, req.answer)
    return result

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass

manager = ConnectionManager()

# --- STATE MACHINE ENDPOINTS ---
class ExamSessionRequest(BaseModel):
    user_id: int = 1 # mock user default
    exam_id: int

@app.post("/api/exam/start")
def start_exam(req: ExamSessionRequest, db: Session = Depends(get_db)):
    # Start state machine
    result = models.ExamResult(user_id=req.user_id, exam_id=req.exam_id, status="ACTIVE")
    db.add(result)
    db.commit()
    db.refresh(result)
    return {"message": "Exam started", "session_id": result.id}

class ExamSaveRequest(BaseModel):
    session_id: int
    answers: dict = {}

@app.post("/api/exam/autosave")
def autosave_exam(req: ExamSaveRequest, db: Session = Depends(get_db)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status in ["TERMINATED", "COMPLETED"]:
        raise HTTPException(status_code=403, detail="Forbidden. Exam was terminated or completed.")
    
    return {"message": "Autosaved successfully"}

class ExamTerminateRequest(BaseModel):
    session_id: int
    reason: str

@app.post("/api/exam/terminate")
async def terminate_exam(req: ExamTerminateRequest, db: Session = Depends(get_db)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if session:
        session.status = "TERMINATED"
        session.proctoring_alerts += 1
        db.commit()
    # Broadcast to websocket to update dashboard
    await manager.broadcast({"type": "dashboard_update", "metric": "active_flags", "value": 1})
    return {"message": "Exam terminated"}

@app.websocket("/ws/proctoring")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    if token != os.environ.get("SECRET_KEY", "default_secret"):
        await websocket.close(code=1008)
        return
    await manager.connect(websocket)
    alerts = 0
    try:
        while True:
            data = await websocket.receive_text()
            
            if data.startswith("{"):
                try:
                    payload = json.loads(data)
                    if payload.get("type") == "alert":
                        await manager.broadcast({"type": "dashboard_update", "metric": "active_flags", "value": 1})
                except Exception:
                    pass
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Mount frontend files at the root
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
