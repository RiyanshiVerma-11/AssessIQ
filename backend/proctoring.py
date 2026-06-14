# Proctoring analysis is now handled entirely client-side using MediaPipe FaceMesh.
# This file is intentionally left blank to remove heavy backend dependencies 
# like OpenCV and MediaPipe, reducing server load and latency to near zero.

def analyze_frame(base64_img: str):
    # Deprecated: Analysis offloaded to frontend/app.js
    return {"alert": False, "message": "Secure"}
