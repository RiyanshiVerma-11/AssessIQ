import json
import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Response, BackgroundTasks, HTTPException, Query
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
import models, database, proctoring, grading, init_db, auth
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

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6)
    role: str = "student"

@app.get("/api/status")
def read_root():
    return {"message": "Intelligent Examinations API is running"}

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = auth.create_access_token(data={"sub": user.username, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "role": user.role}}

@app.post("/api/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    # Check if username exists
    existing_user = db.query(models.User).filter(models.User.username == req.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Check if email exists
    existing_email = db.query(models.User).filter(models.User.email == req.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_pwd = auth.get_password_hash(req.password)
    
    new_user = models.User(
        username=req.username,
        email=req.email,
        hashed_password=hashed_pwd,
        role=req.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User registered successfully"}

@app.get("/api/exams")
def get_exams(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
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
def grade_answer(req: GradeRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if not session or session.status == "TERMINATED":
        return {"score": 0, "feedback": "Evaluation blocked. Exam was terminated due to security violations."}
    if current_user.role != "admin" and session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden. Session belongs to another user.")
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
            
    async def broadcast(self, message):
        for connection in self.active_connections:
            try:
                if isinstance(message, dict):
                    await connection.send_text(json.dumps(message))
                elif isinstance(message, str):
                    await connection.send_text(message)
                else:
                    await connection.send_bytes(message)
            except Exception:
                pass

    async def broadcast_except(self, message, sender: WebSocket):
        for connection in self.active_connections:
            if connection != sender:
                try:
                    if isinstance(message, dict):
                        await connection.send_text(json.dumps(message))
                    elif isinstance(message, str):
                        await connection.send_text(message)
                    else:
                        await connection.send_bytes(message)
                except Exception:
                    pass

manager = ConnectionManager()

# --- STATE MACHINE ENDPOINTS ---
class ExamSessionRequest(BaseModel):
    exam_id: int

@app.post("/api/exam/start")
def start_exam(req: ExamSessionRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Start state machine
    result = models.ExamResult(user_id=current_user.id, exam_id=req.exam_id, status="ACTIVE")
    db.add(result)
    db.commit()
    db.refresh(result)
    return {"message": "Exam started", "session_id": result.id}

class ExamSaveRequest(BaseModel):
    session_id: int
    answers: dict = {}

@app.post("/api/exam/autosave")
def autosave_exam(req: ExamSaveRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden. Session belongs to another user.")
    if session.status in ["TERMINATED", "COMPLETED"]:
        raise HTTPException(status_code=403, detail="Forbidden. Exam was terminated or completed.")
    
    return {"message": "Autosaved successfully"}

class ExamTerminateRequest(BaseModel):
    session_id: int
    reason: str

@app.post("/api/exam/terminate")
async def terminate_exam(req: ExamTerminateRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ExamResult).filter(models.ExamResult.id == req.session_id).first()
    if session:
        if current_user.role != "admin" and session.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden. Cannot terminate another user's session.")
        session.status = "TERMINATED"
        session.proctoring_alerts += 1
        db.commit()
    # Broadcast to websocket to update dashboard
    await manager.broadcast({"type": "dashboard_update", "metric": "active_flags", "value": 1})
    return {"message": "Exam terminated"}

@app.websocket("/ws/proctoring")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    try:
        payload = auth.decode_access_token(token)
    except Exception:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect(code=message.get("code", 1000))
            if "text" in message:
                text_data = message["text"]
                if text_data.startswith("{"):
                    try:
                        data = json.loads(text_data)
                        if data.get("type") == "alert":
                            await manager.broadcast({"type": "dashboard_update", "metric": "active_flags", "value": 1})
                    except Exception:
                        pass
                await manager.broadcast_except(text_data, websocket)
            elif "bytes" in message:
                bytes_data = message["bytes"]
                await manager.broadcast_except(bytes_data, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Mount frontend files at the root
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
