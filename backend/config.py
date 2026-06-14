import os
from pydantic import BaseModel

class Settings(BaseModel):
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "assessiq-super-secret-key-for-local-dev-12345")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

settings = Settings()
