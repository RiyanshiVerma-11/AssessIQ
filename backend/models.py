from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    role = Column(String, default="student") # "student" or "admin"
    exams = relationship("ExamResult", back_populates="user")

class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    questions = relationship("Question", back_populates="exam")

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"))
    text = Column(String)
    answer_type = Column(String) # "mcq", "essay"
    exam = relationship("Exam", back_populates="questions")

class ExamResult(Base):
    __tablename__ = "exam_results"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    exam_id = Column(Integer, ForeignKey("exams.id"))
    score = Column(Integer, default=0)
    proctoring_alerts = Column(Integer, default=0)
    status = Column(String, default="completed") # "completed", "terminated"
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="exams")
