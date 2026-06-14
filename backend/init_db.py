import database, models
from datetime import datetime, timedelta

def seed_data(db):
    try:
        print("Seeding MVP Mock Data...")
        # Create users
        admin = models.User(username="educator_admin", role="admin")
        student = models.User(username="jane_student", role="student")
        db.add(admin)
        db.add(student)
        db.commit()

        # Create 3 highly realistic sample exams
        exam1 = models.Exam(title="Data Structures", description="Core concepts of computer science including trees, graphs, and algorithm complexity.")
        exam2 = models.Exam(title="AI Ethics", description="Evaluation of ethical principles in Artificial Intelligence, bias, and fairness.")
        exam3 = models.Exam(title="Web Security", description="Fundamentals of web application security, OWASP top 10, and cryptography.")
        
        db.add_all([exam1, exam2, exam3])
        db.commit()
        db.refresh(exam1)
        db.refresh(exam2)
        db.refresh(exam3)

        questions = [
            # Exam 1 - Data Structures
            models.Question(exam_id=exam1.id, text="What is the time complexity of searching for an element in a balanced Binary Search Tree?\nA) O(1)\nB) O(n)\nC) O(log n)\nD) O(n^2)", answer_type="mcq"),
            models.Question(exam_id=exam1.id, text="Explain the difference between a stack and a queue. Provide a real-world software engineering scenario where a queue is the optimal data structure.", answer_type="essay"),

            # Exam 2 - AI Ethics
            models.Question(exam_id=exam2.id, text="Which of the following best describes 'algorithmic bias'?\nA) An AI model executing faster than expected\nB) Systematic and repeatable errors that create unfair outcomes\nC) The tendency of AI to prefer binary data\nD) A hardware malfunction", answer_type="mcq"),
            models.Question(exam_id=exam2.id, text="Discuss the ethical implications of using facial recognition technology in public surveillance. Provide two potential mitigation strategies.", answer_type="essay"),
            
            # Exam 3 - Web Security
            models.Question(exam_id=exam3.id, text="Which of the following describes a Cross-Site Scripting (XSS) attack?\nA) Injecting malicious SQL into an input field\nB) Executing arbitrary JavaScript in a victim's browser\nC) Overloading a server with traffic\nD) Sniffing network packets", answer_type="mcq"),
            models.Question(exam_id=exam3.id, text="Explain how a CSRF (Cross-Site Request Forgery) attack works and describe one effective method to prevent it.", answer_type="essay")
        ]
        
        db.add_all(questions)
        db.commit()

        # Add additional mock users for logs
        students = [
            models.User(username="alice_sec", role="student"),
            models.User(username="bob_data", role="student"),
            models.User(username="charlie_ai", role="student"),
            models.User(username="david_test", role="student")
        ]
        db.add_all(students)
        db.commit()
        
        now = datetime.utcnow()
        logs = [
            models.ExamResult(user_id=student.id, exam_id=exam1.id, score=85, proctoring_alerts=0, status="completed", created_at=now - timedelta(hours=2)),
            models.ExamResult(user_id=students[0].id, exam_id=exam3.id, score=92, proctoring_alerts=1, status="completed", created_at=now - timedelta(hours=5)),
            models.ExamResult(user_id=students[1].id, exam_id=exam1.id, score=40, proctoring_alerts=3, status="terminated", created_at=now - timedelta(days=1)),
            models.ExamResult(user_id=students[2].id, exam_id=exam2.id, score=78, proctoring_alerts=0, status="completed", created_at=now - timedelta(days=2)),
            models.ExamResult(user_id=students[3].id, exam_id=exam3.id, score=12, proctoring_alerts=5, status="terminated", created_at=now - timedelta(minutes=30)),
            models.ExamResult(user_id=student.id, exam_id=exam2.id, score=88, proctoring_alerts=0, status="completed", created_at=now - timedelta(minutes=10))
        ]
        db.add_all(logs)
        db.commit()
        
        print("Database seeded successfully.")
    except Exception as e:
        print(f"Error seeding DB: {e}")
        db.rollback()

def init_db():
    print("Initializing Database with MVP Mock Data...")
    models.Base.metadata.drop_all(bind=database.engine)
    models.Base.metadata.create_all(bind=database.engine)
    
    db = database.SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
