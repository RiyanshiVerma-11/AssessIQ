import json

def analyze_frame(data: str):
    try:
        payload = json.loads(data)
        if payload.get("type") == "alert":
            return {"alert": True, "message": payload.get("message", "Violation")}
    except Exception:
        pass
    return {"alert": False, "message": "Secure"}
