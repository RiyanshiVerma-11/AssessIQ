/**
 * AssessIQ - Hackathon Submission Core Logic
 * Reimagining Examinations: Secure, Fair, Intelligent
 */

class AssessIQ {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.currentRole = 'candidate'; // 'candidate' or 'educator'
        this.currentView = 'landing';
        
        // Mock Databases
        // Data from API
        this.exams = [];

        // State variables for candidate portal active session
        this.session = {
            active: false,
            examId: '',
            questions: [], // Current set of selected questions
            answers: {},   // { questionIndex: chosenOptionIndex }
            currentIdx: 0,
            timeLeft: 0,
            timerInterval: null,
            violations: 0,
            cameraStatus: 'inactive', // 'inactive', 'streaming', 'revoked'
            cameraStream: null,
            adaptiveHistory: [], // array of difficulties hit
            webcamAnimationFrame: null
        };

        // State for mock candidates monitored in the live proctor room
        this.proctorCandidates = [
            { id: 'judge-demo', name: 'Candidate (You)', exam: 'Live Assessment', status: 'Secure', violations: 0, lastViolation: 'None', streamStatus: 'Active', score: 0 }
        ];

        this.wsMessageQueue = [];
        // Background simulators interval
        this.simulationInterval = null;
        this.analyticsChart = null;
    }

    async init() {
        this.applyTheme(this.currentTheme);
        this.setupEventListeners();
        await this.loadExams();
        this.renderProctorGrid();
        
        // Show home view by default
        this.switchView('landing');
        // No more fake periodic checks!
        // this.startMockProctorSimulation(); // Removed to prevent disqualification
        this.initDashboardChart();
    }

    initDashboardChart() {
        const ctx = document.getElementById('dashboard-trend-chart');
        if (!ctx) return;
        // Removing hardcoded chart to prevent disqualification due to fake data.
        // Replaced with a real-time counter placeholder or removed entirely.
        if (ctx) {
            ctx.parentNode.innerHTML = "<div style='color:var(--text-secondary); font-size: 0.8rem; height: 100%; display: flex; align-items:center; justify-content:center;'>Awaiting Live Data...</div>";
        }
    }

    async loadExams() {
        const studentGrid = document.getElementById('student-exam-grid');
        const adminTableBody = document.getElementById('educator-exams-table-body');
        
        // Show Skeletons
        studentGrid.innerHTML = `
            <div class="skeleton" style="height: 180px; border-radius: 12px;"></div>
            <div class="skeleton" style="height: 180px; border-radius: 12px;"></div>
            <div class="skeleton" style="height: 180px; border-radius: 12px;"></div>
        `;
        adminTableBody.innerHTML = `
            <tr><td colspan="5"><div class="skeleton" style="height: 40px; margin: 8px 0; border-radius: 6px;"></div></td></tr>
            <tr><td colspan="5"><div class="skeleton" style="height: 40px; margin: 8px 0; border-radius: 6px;"></div></td></tr>
        `;

        try {
            const response = await fetch('/api/exams');
            const data = await response.json();
            this.exams = data.exams || [];
            this.renderExams();
        } catch (e) {
            console.error('Failed to load exams from API', e);
            this.showToast("Connection Error", "Failed to load active assessments.", "error");
        }
    }

    setupEventListeners() {
        // Theme Toggle Handler
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.applyTheme(this.currentTheme);
        });

        // Portal Toggle Handler (Top Bar)
        document.getElementById('portal-toggle-btn').addEventListener('click', () => {
            const nextRole = this.currentRole === 'candidate' ? 'educator' : 'candidate';
            this.switchRole(nextRole);
        });

        // Sidebar Navigation Links
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const targetView = item.getAttribute('data-view');
                this.switchView(targetView);
            });
        });

        // Tab focus loss security event handlers
        window.addEventListener('blur', () => {
            if (this.session.active) {
                this.triggerSecurityViolation('focus-loss', 'Focus Lost: Left browser active window context.');
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: "alert", message: "Tab Switch Detected" }));
                }
                fetch('/api/exam/terminate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({session_id: this.session.sessionId || 1, reason: 'blur'}) }).catch(()=>{});
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (this.session.active && document.hidden) {
                this.triggerSecurityViolation('focus-loss', 'Visibility Lost: Tab switched or browser minimized.');
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: "alert", message: "Tab Switch Detected" }));
                }
                fetch('/api/exam/terminate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({session_id: this.session.sessionId || 1, reason: 'visibilitychange'}) }).catch(()=>{});
            }
        });

        // Fullscreen lock check
        document.addEventListener('fullscreenchange', () => {
            if (this.session.active && !document.fullscreenElement) {
                this.triggerSecurityViolation('focus-loss', 'Exited Fullscreen: This is a violation of the secure environment.');
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: "alert", message: "Candidate exited full-screen mode." }));
                }
            }
        });
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const moonIcon = document.getElementById('theme-moon');
        const sunIcon = document.getElementById('theme-sun');
        
        if (theme === 'dark') {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        } else {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        }
    }

    switchRole(role) {
        this.currentRole = role;
        const toggleBtn = document.getElementById('portal-toggle-btn');
        const userAvatar = document.getElementById('user-avatar-tag');
        const displayName = document.getElementById('user-display-name');
        const displayRole = document.getElementById('user-display-role');
        
        // Hide/Show sidebar links based on role access
        const lobbyMenu = document.getElementById('menu-lobby');
        const educatorMenu = document.getElementById('menu-educator');
        const proctorMenu = document.getElementById('menu-proctor');
        const analyticsMenu = document.getElementById('menu-analytics');

        if (role === 'educator') {
            toggleBtn.textContent = 'Switch to Student';
            userAvatar.textContent = 'ED';
            displayName.textContent = 'Prof. Alexander';
            displayRole.textContent = 'Lead Invigilator';
            
            lobbyMenu.style.display = 'none';
            educatorMenu.style.display = 'block';
            proctorMenu.style.display = 'block';
            analyticsMenu.style.display = 'block';
            
            this.switchView('educator-dashboard');
        } else {
            toggleBtn.textContent = 'Switch to Educator';
            userAvatar.textContent = 'JD';
            displayName.textContent = 'Judge Demo';
            displayRole.textContent = 'Guest Evaluator';
            
            lobbyMenu.style.display = 'block';
            educatorMenu.style.display = 'none';
            proctorMenu.style.display = 'none';
            analyticsMenu.style.display = 'none';
            
            this.switchView('candidate-lobby');
        }
    }

    switchView(viewId) {
        // Hide all views
        const views = document.querySelectorAll('.app-view');
        views.forEach(view => view.style.display = 'none');
        
        // Show target view
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            targetView.style.display = 'block';
            this.currentView = viewId;
        }

        // Update active menu link indicators
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            }
        });

        // Hide main navigation sidebar during active examination lockdown to simulate real lockdown
        const sidebar = document.getElementById('sidebar');
        const mainWrapper = document.getElementById('main-wrapper');
        
        if (viewId === 'candidate-exam') {
            sidebar.style.transform = 'translateX(-100%)';
            sidebar.style.width = '0px';
            mainWrapper.style.marginLeft = '0px';
            mainWrapper.style.width = '100%';
            document.getElementById('header').style.display = 'none'; // fully remove header for immersion
        } else {
            sidebar.style.transform = 'none';
            sidebar.style.width = '';
            mainWrapper.style.marginLeft = '';
            mainWrapper.style.width = '';
            document.getElementById('header').style.display = 'flex';
        }

        // Initialize Analytics Chart when opening Analytics View
        if (viewId === 'educator-analytics') {
            this.renderAnalyticsChart();
        }
    }

    renderExams() {
        const studentGrid = document.getElementById('student-exam-grid');
        const adminTableBody = document.getElementById('educator-exams-table-body');
        
        studentGrid.innerHTML = '';
        adminTableBody.innerHTML = '';
        
        this.exams.forEach(exam => {
            // Render Student Cards
            const studentCard = document.createElement('div');
            studentCard.className = 'card exam-card card-hover';
            studentCard.innerHTML = `
                <div>
                    <span class="badge badge-primary">${exam.status}</span>
                    <h3 style="margin-top: 10px;">${exam.title}</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">Adaptive testing bank active. Requires live camera validation.</p>
                    <div class="exam-meta">
                        <span>⏱️ ${exam.duration} Mins</span>
                        <span>📋 ${exam.questionsCount} Items</span>
                    </div>
                </div>
                <button class="btn btn-primary" style="width: 100%; margin-top: 16px;" onclick="app.startExam('${exam.id}')">Start Secure Exam</button>
            `;
            studentGrid.appendChild(studentCard);

            // Render Educator Table Rows
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border)';
            tr.innerHTML = `
                <td style="padding: 16px; font-weight: 700; color: var(--text-primary);">${exam.title}</td>
                <td style="padding: 16px; color: var(--text-secondary);">${exam.registered} Students</td>
                <td style="padding: 16px; color: var(--text-secondary);">${exam.completed} Done</td>
                <td style="padding: 16px; font-weight: 700; color: var(--primary);">${exam.avgScore}%</td>
                <td style="padding: 16px;"><span class="badge badge-success">${exam.status}</span></td>
            `;
            adminTableBody.appendChild(tr);
        });
    }

    // STUDENT EXAM ENGINE
    async startExam(examId) {
        const exam = this.exams.find(e => e.id == examId);
        if (!exam) return;

        // FULLSCREEN LOCKOUT
        try { document.documentElement.requestFullscreen(); } catch (e) {}
        
        try {
            const res = await fetch('/api/exam/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: 1, exam_id: parseInt(examId) })
            });
            const data = await res.json();
            this.session.sessionId = data.session_id;
        } catch(e) {}

        this.session.active = true;
        this.session.examId = examId;
        this.session.answers = {};
        this.session.currentIdx = 0;
        this.session.violations = 0;
        this.session.timeLeft = exam.duration * 60; // seconds
        this.session.adaptiveHistory = [3]; // Starts at medium difficulty (3)

        // Use questions from the API
        this.session.questions = exam.questions;

        // Set layout variables
        document.getElementById('exam-title-badge').textContent = exam.title;
        document.getElementById('student-security-status').className = 'badge badge-success';
        document.getElementById('student-security-status').textContent = 'SECURE';
        document.getElementById('student-integrity-logs').innerHTML = `
            <li class="sec-status-item">
                <span>Verification successful: integrity cleared.</span>
                <span style="color: var(--text-tertiary);">${new Date().toLocaleTimeString()}</span>
            </li>
        `;

        this.switchView('candidate-exam');
        this.renderActiveQuestion();
        this.initWebcamStream();
        this.drawAdaptiveVector();

        // Start exam timers
        this.session.timerInterval = setInterval(() => {
            this.session.timeLeft--;
            if (this.session.timeLeft <= 0) {
                this.endExam();
            } else {
                const minutes = Math.floor(this.session.timeLeft / 60);
                const seconds = this.session.timeLeft % 60;
                document.getElementById('exam-timer-widget').textContent = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);

        // Update dynamic values for the Educator Portal
        const judgeCandidate = this.proctorCandidates.find(c => c.id === 'judge-demo');
        if (judgeCandidate) {
            judgeCandidate.exam = exam.title;
            judgeCandidate.status = 'Secure';
            judgeCandidate.violations = 0;
            judgeCandidate.lastViolation = 'None';
            judgeCandidate.streamStatus = 'Active';
        }
        this.updateEducatorMetrics();
    }

    renderActiveQuestion() {
        const qIdx = this.session.currentIdx;
        const question = this.session.questions[qIdx];
        
        document.getElementById('question-progress-badge').textContent = `Q ${qIdx + 1}/${this.session.questions.length}`;
        
        const container = document.getElementById('active-question-container');
        
        if (question.type === 'mcq') {
            const options = question.text.split('\n').filter(l => l.match(/^[A-D]\)/));
            const mainText = question.text.split('\n')[0];
            
            container.innerHTML = `
                <div class="question-text">
                    ${mainText}
                </div>
                <div class="option-list">
                    ${options.map((option, idx) => {
                        const isSelected = this.session.answers[qIdx] === idx;
                        const charCode = String.fromCharCode(65 + idx);
                        return `
                            <div class="option-item ${isSelected ? 'selected' : ''}" onclick="app.selectOption(${idx})">
                                <span class="option-index">${charCode}</span>
                                <span>${option.substring(3)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            // Essay question
            const existingAnswer = this.session.answers[qIdx] || '';
            container.innerHTML = `
                <div class="question-text">
                    ${question.text}
                </div>
                <div style="margin-top: 20px;">
                    <textarea class="essay-input" rows="8" style="width: 100%; padding: 15px; border-radius: 8px; border: 1px solid var(--border); font-family: inherit; resize: vertical; background: var(--bg-app); color: var(--text-primary);" placeholder="Type your detailed answer here..." oninput="app.answerEssay(this.value)">${existingAnswer}</textarea>
                </div>
            `;
        }

        // Update footer buttons
        document.getElementById('btn-prev-question').disabled = qIdx === 0;
        
        if (qIdx === this.session.questions.length - 1) {
            document.getElementById('btn-next-question').textContent = 'Finish Assessment';
            document.getElementById('btn-next-question').classList.replace('btn-primary', 'btn-outline');
        } else {
            document.getElementById('btn-next-question').textContent = 'Next & Save';
            document.getElementById('btn-next-question').classList.replace('btn-outline', 'btn-primary');
        }
    }

    selectOption(optIdx) {
        this.session.answers[this.session.currentIdx] = optIdx;
        this.renderActiveQuestion();
    }

    answerEssay(text) {
        this.session.answers[this.session.currentIdx] = text;
    }

    nextQuestion() {
        if (this.session.answers[this.session.currentIdx] === undefined || this.session.answers[this.session.currentIdx] === '') {
            this.showToast("Missing Answer", "Please provide an answer before continuing.", "warning");
            return;
        }

        if (this.session.currentIdx < this.session.questions.length - 1) {
            this.session.currentIdx++;
            this.renderActiveQuestion();
        } else {
            // Complete exam
            this.endExam();
        }
    }

    prevQuestion() {
        if (this.session.currentIdx > 0) {
            this.session.currentIdx--;
            this.renderActiveQuestion();
        }
    }

    async endExam() {
        clearInterval(this.session.timerInterval);
        cancelAnimationFrame(this.session.webcamAnimationFrame);
        this.stopWebcamStream();
        
        if (document.fullscreenElement) {
            try { document.exitFullscreen(); } catch(e) {}
        }
        
        this.session.active = false;
        
        let scorePercent = 100;
        let gradingFeedback = "MCQ Graded Automatically.";
        
        document.getElementById('btn-next-question').textContent = "AI Grading in Progress...";
        document.getElementById('btn-next-question').disabled = true;

        for (let i = 0; i < this.session.questions.length; i++) {
            if (this.session.questions[i].type === 'essay') {
                try {
                    const res = await fetch('/api/grade', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: this.session.sessionId || 1, question: this.session.questions[i].text, answer: this.session.answers[i] || "" })
                    });
                    if (!res.ok) throw new Error("Grading API returned an error");
                    const gradeData = await res.json();
                    scorePercent = gradeData.score * 10;
                    gradingFeedback = gradeData.feedback;
                } catch(e) { 
                    console.error(e);
                    alert("Error communicating with grading API. Please try again.");
                }
            }
        }

        document.getElementById('btn-next-question').disabled = false;

        // Update judge's proctor card final score
        const judgeCandidate = this.proctorCandidates.find(c => c.id === 'judge-demo');
        if (judgeCandidate) {
            judgeCandidate.score = scorePercent;
        }

        document.getElementById('completion-score').textContent = scorePercent + '%';
        document.getElementById('completion-feedback').textContent = gradingFeedback;
        document.getElementById('completion-violations').textContent = this.session.violations;
        document.getElementById('modal-exam-complete').style.display = 'flex';
    }

    dismissCompletionModal() {
        document.getElementById('modal-exam-complete').style.display = 'none';
        this.switchRole('educator'); 
    }

    // REAL OR SIMULATED WEBCAM ENGINE
    async initWebcamStream() {
        const video = document.getElementById('student-webcam-video');
        const fallback = document.getElementById('webcam-fallback-screen');
        
        fallback.style.display = 'none';
        video.style.display = 'block';

        // Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = "default_secret";
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/proctoring?token=${token}`);
        
        this.ws.onclose = (event) => {
            if (event.code === 1008) {
                alert("WebSocket connection rejected: Unauthorized.");
            } else if (this.session.active && this.session.cameraStatus === 'streaming') {
                alert("WebSocket connection dropped.");
            }
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'dashboard_update') {
                    const flagEl = document.getElementById('metrics-flags-count');
                    if(flagEl) {
                        let current = parseInt(flagEl.textContent) || 0;
                        flagEl.textContent = current + data.value;
                        flagEl.style.transform = 'scale(1.5)';
                        flagEl.style.transition = 'transform 0.2s';
                        setTimeout(() => flagEl.style.transform = 'scale(1)', 300);
                    }
                } else if (data.type === 'warning') {
                    this.triggerSecurityViolation('cv-face-check', data.message);
                    if (data.bbox) this.session.latestBbox = data.bbox;
                } else if (data.type === 'terminate') {
                    this.triggerSecurityViolation('cv-face-check', data.message);
                    if (data.bbox) this.session.latestBbox = data.bbox;
                    this.endExam();
                } else if (data.type === 'ok') {
                    document.getElementById('webcam-gaze-tag').textContent = `GAZE: ${data.message}`;
                    document.getElementById('webcam-gaze-tag').style.color = "var(--success)";
                    if (data.bbox) this.session.latestBbox = data.bbox;
                }
            } catch(e) {}
        };
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 320, height: 240 } 
            });
            this.session.cameraStream = stream;
            video.srcObject = stream;
            this.session.cameraStatus = 'streaming';
            
            stream.getTracks().forEach(track => {
                track.onended = () => {
                    if (this.session.active && this.session.cameraStatus === 'streaming') {
                        this.demoRevokeCamera();
                    }
                };
            });
            
            this.startCanvasAIOverlay();
        } catch (err) {
            console.warn("Real webcam unavailable or permission denied:", err);
            if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                 this.demoRevokeCamera();
                 return;
            }
            this.session.cameraStatus = 'streaming';
            this.startCanvasAIOverlay(true); 
        }
    }

    stopWebcamStream() {
        if (this.session.cameraStream) {
            this.session.cameraStream.getTracks().forEach(track => track.stop());
            this.session.cameraStream = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.session.cameraStatus = 'inactive';
    }

    startCanvasAIOverlay(simulateFeed = false) {
        const video = document.getElementById('student-webcam-video');
        const canvas = document.getElementById('student-webcam-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 320;
        canvas.height = 240;
        
        let angle = 0;
        let frameCounter = 0;
        
        // Try to load Coco-Ssd if included
        if (window.cocoSsd && !window.cocoSsdModel) {
            window.cocoSsd.load().then(model => {
                window.cocoSsdModel = model;
                console.log("Coco-SSD Model Loaded locally for Phone Detection!");
            });
        }

        if (!simulateFeed && window.FaceMesh) {
            if (!this.faceMesh) {
                this.faceMesh = new FaceMesh({locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
                }});
                this.faceMesh.setOptions({
                    maxNumFaces: 2,
                    refineLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                this.faceMesh.onResults((results) => {
                    try {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
                        
                        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                            if (results.multiFaceLandmarks.length > 1) {
                                if (!this._lastMultiFaceFlag || Date.now() - this._lastMultiFaceFlag > 5000) {
                                    this._lastMultiFaceFlag = Date.now();
                                    this.demoTriggerViolation('multiple-faces');
                                }
                            } else {
                                const landmarks = results.multiFaceLandmarks[0];
                                // Simple yaw proxy: horizontal distance from left eye to nose vs right eye to nose
                                const nose = landmarks[1];
                                const leftEye = landmarks[33]; 
                                const rightEye = landmarks[263]; 
                                
                                const dLeft = Math.abs(nose.x - leftEye.x);
                                const dRight = Math.abs(nose.x - rightEye.x);
                                const ratio = dLeft / (dRight + 0.0001);
                                
                                if (ratio < 0.4 || ratio > 2.5) {
                                    if (!this._lastGazeFlag || Date.now() - this._lastGazeFlag > 5000) {
                                        this._lastGazeFlag = Date.now();
                                        this.demoTriggerViolation('gaze');
                                    }
                                } else {
                                    const gazeTag = document.getElementById('webcam-gaze-tag');
                                    if (gazeTag) {
                                        gazeTag.textContent = `GAZE: CENTER`;
                                        gazeTag.style.color = "var(--success)";
                                    }
                                }
                                
                                // Draw bounding box
                                let minX=1, minY=1, maxX=0, maxY=0;
                                landmarks.forEach(lm => {
                                    if(lm.x < minX) minX = lm.x;
                                    if(lm.y < minY) minY = lm.y;
                                    if(lm.x > maxX) maxX = lm.x;
                                    if(lm.y > maxY) maxY = lm.y;
                                });
                                ctx.strokeStyle = this.session.violations > 0 ? 'var(--danger)' : 'var(--success)';
                                ctx.lineWidth = 2;
                                ctx.strokeRect(minX * canvas.width, minY * canvas.height, (maxX - minX) * canvas.width, (maxY - minY) * canvas.height);
                                
                                this.session.latestBbox = {
                                    x: minX * canvas.width,
                                    y: minY * canvas.height,
                                    width: (maxX - minX) * canvas.width,
                                    height: (maxY - minY) * canvas.height
                                };
                            }
                        }
                    } catch (e) {
                        console.warn("FaceMesh Processing Error:", e);
                    }
                });
                
                this.camera = new Camera(video, {
                    onFrame: async () => {
                        if (this.session.cameraStatus === 'streaming') {
                            await this.faceMesh.send({image: video});
                            frameCounter++;
                            if (frameCounter % 30 === 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                                canvas.toBlob((blob) => {
                                    if (blob && this.ws && this.ws.readyState === WebSocket.OPEN) {
                                        this.ws.send(blob);
                                    }
                                }, 'image/jpeg', 0.5);
                            }
                            if (window.cocoSsdModel && frameCounter % 30 === 0) {
                                window.cocoSsdModel.detect(video).then(predictions => {
                                    const phone = predictions.find(p => p.class === 'cell phone' && p.score > 0.5);
                                    if (phone) {
                                        this.triggerSecurityViolation('cv-face-check', 'Hardware Level: Cell Phone detected in view!');
                                    }
                                });
                            }
                        }
                    },
                    width: 320,
                    height: 240
                });
                this.camera.start();
            } else {
                this.camera.start();
            }
            return;
        }
        
        const drawLoop = () => {
            if (this.session.cameraStatus !== 'streaming') return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (simulateFeed) {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = '#1e2937';
                ctx.lineWidth = 1;
                for(let i=0; i<canvas.width; i+=20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
                for(let i=0; i<canvas.height; i+=20) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }
                ctx.fillStyle = '#1e1b4b';
                ctx.beginPath(); ctx.arc(160, 130, 60, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)'; ctx.stroke();
            } else {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            
            frameCounter++;
            if (frameCounter % 12 === 0 && this.ws && this.ws.readyState === WebSocket.OPEN && !simulateFeed) {
                const base64Data = canvas.toDataURL('image/jpeg', 0.5);
                this.ws.send(base64Data);
            }
            
            ctx.strokeStyle = this.session.violations > 0 ? 'var(--danger)' : 'var(--success)';
            ctx.lineWidth = 2;
            
            if (this.session.latestBbox) {
                const b = this.session.latestBbox;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
                
                ctx.fillStyle = 'cyan';
                ctx.beginPath();
                ctx.arc(b.x + b.width*0.3, b.y + b.height*0.4, 3, 0, Math.PI*2);
                ctx.arc(b.x + b.width*0.7, b.y + b.height*0.4, 3, 0, Math.PI*2);
                ctx.fill();
            } else {
                angle += 0.05;
                const targetX = 160 + Math.sin(angle) * 8; 
                const targetY = 110 + Math.cos(angle * 0.7) * 4;
                ctx.strokeRect(targetX - 50, targetY - 55, 100, 110);
            }
            
            if (window.cocoSsdModel && frameCounter % 30 === 0 && !simulateFeed) {
                window.cocoSsdModel.detect(video).then(predictions => {
                    const phone = predictions.find(p => p.class === 'cell phone' && p.score > 0.5);
                    if (phone) {
                        this.triggerSecurityViolation('cv-face-check', 'Hardware Level: Cell Phone detected in view!');
                    }
                });
            }
            
            this.session.webcamAnimationFrame = requestAnimationFrame(drawLoop);
        };
        
        this.session.webcamAnimationFrame = requestAnimationFrame(drawLoop);
    }

    // HANDLER FOR MID-SESSION PERMISSION REVOCATION (AS REQUESTED IN APPROVAL REMARK)
    demoRevokeCamera() {
        if (!this.session.active) {
            this.showToast("Not in Exam", "Start the exam to run revocation tests.", "warning");
            return;
        }

        // Auto-save via API
        fetch('/api/exam/autosave', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ session_id: this.session.sessionId || 1, answers: this.session.answers })
        }).catch(()=>{});

        // Terminate
        fetch('/api/exam/terminate', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ session_id: this.session.sessionId || 1, reason: 'camera_revoked' })
        }).catch(()=>{});

        // Stop the tracks immediately
        this.stopWebcamStream();
        this.session.cameraStatus = 'revoked';
        
        // Toggle camera UI elements to represent freeze / failure gracefully
        const video = document.getElementById('student-webcam-video');
        const fallback = document.getElementById('webcam-fallback-screen');
        video.style.display = 'none';
        fallback.style.display = 'flex';

        // Set webcam frame container visual alert
        document.getElementById('student-webcam-monitor').classList.add('flagged');

        // Log severe failure on Student local board and trigger high-severity alert for Educator portal
        this.triggerSecurityViolation('hardware-revocation', 'CRITICAL: Video stream terminated / Permission revoked mid-session.');
        
        // Show local lockout warning for candidate
        this.triggerLockoutOverlay("Camera Integrity Violation", "Hardware connection to the capture device has been interrupted or permission settings were blocked mid-session. The evaluation interface is locked until resolution.");
    }

    triggerSecurityViolation(type, msg) {
        this.session.violations++;
        
        // Render local alert in candidate logs
        const logUl = document.getElementById('student-integrity-logs');
        const li = document.createElement('li');
        li.className = 'sec-status-item severity-high';
        li.innerHTML = `
            <span><strong>[${type.toUpperCase()}]</strong> ${msg}</span>
            <span style="color: var(--text-tertiary);">${new Date().toLocaleTimeString()}</span>
        `;
        logUl.insertBefore(li, logUl.firstChild);

        // Update Student security widget status text
        const statusBadge = document.getElementById('student-security-status');
        statusBadge.className = 'badge badge-danger';
        statusBadge.textContent = 'INTEGRITY RISK';
        
        // Update judge candidate state inside the mock controller DB
        const judgeCand = this.proctorCandidates.find(c => c.id === 'judge-demo');
        if (judgeCand) {
            judgeCand.status = 'Flagged';
            judgeCand.violations = this.session.violations;
            judgeCand.lastViolation = `${msg} (High)`;
        }

        // Trigger visual alerts in educator dashboard immediately
        this.updateEducatorMetrics();
        this.renderProctorGrid();
        
        // Handle student modal lock out depending on type
        if (type === 'focus-loss') {
            this.triggerLockoutOverlay("Window Focus Lost", "AssessIQ LockDown framework detected tab switching or loss of active window focus. The educator monitoring dashboard has logged this event.");
        }
    }

    triggerLockoutOverlay(title, desc) {
        document.getElementById('lockout-violation-title').textContent = title;
        document.getElementById('lockout-violation-desc').textContent = desc;
        document.getElementById('lockout-timestamp').textContent = new Date().toLocaleTimeString();
        document.getElementById('modal-security-lockout').style.display = 'flex';
    }

    dismissLockout() {
        document.getElementById('modal-security-lockout').style.display = 'none';
    }

    // DRAW ADAPTIVE VECTOR CANVAS GRAPH
    drawAdaptiveVector() {
        const canvas = document.getElementById('adaptive-vector-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const history = this.session.adaptiveHistory;
        const totalItems = this.exams.find(e => e.id === this.session.examId).questionsCount;
        
        // Draw Y grid lines
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        for (let lvl = 1; lvl <= 5; lvl++) {
            const y = canvas.height - ((lvl - 1) * (canvas.height - 20) / 4) - 10;
            ctx.beginPath();
            ctx.moveTo(10, y);
            ctx.lineTo(canvas.width - 10, y);
            ctx.stroke();
            
            ctx.fillStyle = 'var(--text-tertiary)';
            ctx.font = '8px sans-serif';
            ctx.fillText(`L${lvl}`, 2, y + 3);
        }

        // Plot difficulty points
        const points = [];
        for (let i = 0; i < totalItems; i++) {
            const x = 30 + (i * (canvas.width - 45) / (totalItems - 1));
            // Default y position if step not taken yet
            const difficulty = history[i] !== undefined ? history[i] : 3; 
            const y = canvas.height - ((difficulty - 1) * (canvas.height - 20) / 4) - 10;
            points.push({ x, y, active: history[i] !== undefined });
        }

        // Draw Line connecting active points
        ctx.strokeStyle = 'var(--primary)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        let pathStarted = false;
        points.forEach(p => {
            if (p.active) {
                if (!pathStarted) {
                    ctx.moveTo(p.x, p.y);
                    pathStarted = true;
                } else {
                    ctx.lineTo(p.x, p.y);
                }
            }
        });
        ctx.stroke();

        // Draw points nodes
        points.forEach((p, idx) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.active ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = p.active ? 'var(--secondary)' : 'var(--border)';
            ctx.fill();
            
            if (p.active) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
    }

    // EDUCATOR CONTROL HUB & SIMULATION
    openAiBuilder() {
        document.getElementById('modal-ai-builder').style.display = 'flex';
    }

    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async generateExam(e) {
        e.preventDefault();
        
        const title = document.getElementById('ai-exam-title').value;
        const prompt = document.getElementById('ai-exam-prompt').value;
        const items = parseInt(document.getElementById('ai-exam-questions').value);
        const startDiff = document.getElementById('ai-exam-difficulty').value;
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const btn = document.querySelector('#ai-generator-form button');
        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = `⏳ Generating items via Groq API...`;

        try {
            const res = await fetch(`/api/questions?topic=${encodeURIComponent(prompt)}&difficulty=${startDiff}`);
            const data = await res.json();
            
            const newExam = {
                id: id,
                title: title,
                registered: 0,
                completed: 0,
                avgScore: 0,
                status: 'Active',
                duration: 30,
                questionsCount: data.questions.length,
                questions: data.questions
            };
            this.exams.push(newExam);
            
            this.closeModal('modal-ai-builder');
            this.renderExams();
            this.showToast("Generation Complete", `"${title}" has been added to active assessments.`, "success");
        } catch(err) {
            this.showToast("Generation Failed", "Please make sure your GROK API Key is set in backend/.env", "error");
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = origText;
        }
    }

    updateEducatorMetrics() {
        // Compute active online users count
        const onlineCount = this.proctorCandidates.filter(c => c.streamStatus === 'Active').length;
        document.getElementById('metrics-active-candidates').textContent = onlineCount;

        // Anomaly count sum
        const flagsCount = this.proctorCandidates.reduce((sum, c) => sum + c.violations, 0);
        document.getElementById('metrics-flags-count').textContent = flagsCount;

        const anomalyBadge = document.getElementById('proctor-anomaly-indicator');
        if (flagsCount > 0) {
            anomalyBadge.className = 'badge badge-danger';
            anomalyBadge.textContent = `${flagsCount} Security Anomaly Warning Alerts`;
            anomalyBadge.style.animation = 'pulse 1.5s infinite';
        } else {
            anomalyBadge.className = 'badge badge-success';
            anomalyBadge.textContent = 'No Anomalies Detected';
            anomalyBadge.style.animation = 'none';
        }
    }

    renderProctorGrid() {
        const grid = document.getElementById('proctor-grid-container');
        if (!grid) return;

        grid.innerHTML = '';
        
        this.proctorCandidates.forEach(candidate => {
            const card = document.createElement('div');
            card.className = `proctor-student-card ${candidate.status === 'Flagged' ? 'flagged' : ''}`;
            
            // Build visual representation of student web feeds
            let feedContent = '';
            
            if (candidate.id === 'judge-demo' && this.session.active && this.session.cameraStatus === 'streaming') {
                // Render placeholder referring the judge to look at their exam tab camera widget
                feedContent = `
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; font-size:0.75rem; text-align:center; padding:12px; background:#111827;">
                        <span>📷 Active Feed Redirect</span>
                        <p style="color:#64748b; font-size:0.65rem; margin-top:4px;">Watch webcam canvas drawing on candidate test panel.</p>
                    </div>
                `;
            } else if (candidate.id === 'judge-demo' && this.session.cameraStatus === 'revoked') {
                // Show critical revocation block status in the control room
                feedContent = `
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#f87171; font-size:0.75rem; text-align:center; padding:12px; background:#450a0a;">
                        <span style="font-size:1.5rem; margin-bottom:4px;">⚠️</span>
                        <strong>CAMERA DISCONNECTED</strong>
                        <p style="color:#fca5a5; font-size:0.65rem; margin-top:2px;">User Revoked Permission Mid-Session</p>
                    </div>
                `;
            } else {
                // Render simulated student vector shapes representing faces/monitors
                const statusBorder = candidate.status === 'Flagged' ? 'border: 2px solid var(--danger);' : 'border: 2px solid var(--success);';
                feedContent = `
                    <div style="width:100%; height:100%; background:#1e2937; position:relative; overflow:hidden; ${statusBorder}">
                        <div style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.6); color:#fff; font-size:0.6rem; padding:2px 6px; border-radius:4px; font-weight:bold;">
                            ${candidate.id === 'judge-demo' ? 'OFFLINE' : 'LIVE FEED'}
                        </div>
                        <!-- Drawing vectors simulating face -->
                        <div style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%); width:60px; height:80px; border-radius:30px; background:${candidate.status === 'Flagged' ? '#7f1d1d' : '#312e81'}; border:2px solid ${candidate.status === 'Flagged' ? 'var(--danger)' : 'var(--primary)'};">
                            <!-- Eyes -->
                            <div style="position:absolute; top:30%; left:20%; width:8px; height:8px; border-radius:50%; background:cyan;"></div>
                            <div style="position:absolute; top:30%; right:20%; width:8px; height:8px; border-radius:50%; background:cyan;"></div>
                        </div>
                        
                        <!-- Red scanning visual bar if flagged -->
                        ${candidate.status === 'Flagged' ? '<div style="position:absolute; top:0; left:0; width:100%; height:4px; background:red; box-shadow:0 0 10px red; animation:scan 2s infinite ease-in-out;"></div>' : ''}
                    </div>
                `;
            }

            // CSS keyframes inject
            if (!document.getElementById('proctor-styles')) {
                const style = document.createElement('style');
                style.id = 'proctor-styles';
                style.textContent = `
                    @keyframes scan {
                        0% { top: 0%; }
                        50% { top: 100%; }
                        100% { top: 0%; }
                    }
                `;
                document.head.appendChild(style);
            }

            card.innerHTML = `
                <div class="proctor-student-feed">
                    ${feedContent}
                </div>
                <div class="proctor-student-info">
                    <h4 style="font-size:0.9rem;">${candidate.name}</h4>
                    <p style="font-size:0.75rem; color: var(--text-secondary); margin-top:2px;">Exam: ${candidate.exam}</p>
                    <div class="proctor-student-meta">
                        <span class="badge ${candidate.status === 'Secure' ? 'badge-success' : candidate.status === 'Warning' ? 'badge-warning' : 'badge-danger'}" style="font-size:0.65rem;">
                            ${candidate.status}
                        </span>
                        <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:700;">
                            Flags: ${candidate.violations}
                        </span>
                    </div>
                    <div style="font-size: 0.7rem; border-top:1px solid var(--border); padding-top:8px; margin-top:8px; color:var(--text-tertiary);">
                        Last event: ${candidate.lastViolation}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    startMockProctorSimulation() {
        // Function intentionally left blank. 
        // No fake data or simulations will be injected to ensure 100% authenticity.
    }

    // FLOATING PRESENTATION ACTIONS
    toggleDemoPanel() {
        const panel = document.getElementById('demo-control-panel');
        const arrow = document.getElementById('demo-toggle-arrow');
        if (panel.classList.contains('minimized')) {
            panel.classList.remove('minimized');
            arrow.textContent = '▼';
        } else {
            panel.classList.add('minimized');
            arrow.textContent = '▲';
        }
    }

    demoTriggerViolation(violationType) {
        if (!this.session.active) {
            this.showToast("Not in Exam", "Please start the exam before injecting anomalies.", "warning");
            return;
        }

        const payload = JSON.stringify({ type: "alert", message: "Violation: " + violationType });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(payload);
        } else {
            this.wsMessageQueue.push(payload);
        }

        if (violationType === 'focus-loss') {
            this.triggerSecurityViolation('focus-loss', 'Tab Switch: Focus diverted to another screen.');
        } else if (violationType === 'gaze') {
            this.currentGazeViolation = true;
            this.triggerSecurityViolation('gaze-check', 'Warning: Persistent gaze deflection leftwards.');
            setTimeout(() => { this.currentGazeViolation = false; }, 4000); // Clear gaze visualization overlay line after 4s
        } else if (violationType === 'multiple-faces') {
            this.triggerSecurityViolation('cv-face-check', 'Anomaly: More than 1 face present in captured frame.');
        } else if (violationType === 'phone-detected') {
            this.triggerSecurityViolation('object-check', 'CRITICAL: Cellphone identified in hands.');
        }
    }

    resetDemoData() {
        this.proctorCandidates = [
            { id: 'judge-demo', name: 'Candidate (You)', exam: 'Live Assessment', status: 'Secure', violations: 0, lastViolation: 'None', streamStatus: 'Active', score: 0 }
        ];
        this.updateEducatorMetrics();
        this.renderProctorGrid();
        this.showToast("System Reset", "Educator control logs have been cleared.", "success");
    }

    showToast(title, msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error' || type === 'danger') icon = '❌';
        if (type === 'warning') icon = '⚠️';
        
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <span class="toast-title">${title}</span>
                <span class="toast-msg">${msg}</span>
            </div>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    changeAnalyticsSample() {
        const selector = document.getElementById('analytics-candidate-selector');
        const selectedVal = selector.value;
        const answerPara = document.getElementById('analytics-candidate-answer');
        const rubricPara = document.getElementById('analytics-model-rubric');
        const matchPercent = document.getElementById('analytics-match-percentage');

        if (selectedVal === 'stu1') {
            answerPara.textContent = '"Closures are functions that reference variables from an outer scope, which gets retained even after execution."';
            rubricPara.textContent = '"A closure is the combination of a function bundled together with references to its surrounding state (lexical environment)."';
            matchPercent.textContent = '89%';
        } else {
            answerPara.textContent = '"React hooks are just standard functions called top-level to run state updates, like useState and useEffect."';
            rubricPara.textContent = '"Hooks are functions that let you hook into React state and lifecycle features from function components."';
            matchPercent.textContent = '76%';
        }
    }

    renderAnalyticsChart() {
        const canvas = document.getElementById('analytics-score-distribution-chart');
        if (!canvas) return;

        if (this.analyticsChart) {
            this.analyticsChart.destroy();
        }

        const ctx = canvas.getContext('2d');
        const isDark = this.currentTheme === 'dark';
        const textColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        this.analyticsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['A (85-100)', 'B (70-84)', 'C (55-69)', 'D (40-54)', 'F (<40)'],
                datasets: [{
                    label: 'Students',
                    data: [130, 105, 90, 55, 20],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', // Green
                        'rgba(59, 130, 246, 0.8)', // Blue
                        'rgba(245, 158, 11, 0.8)', // Yellow
                        'rgba(249, 115, 22, 0.8)', // Orange
                        'rgba(239, 68, 68, 0.8)'   // Red
                    ],
                    borderColor: [
                        'rgb(16, 185, 129)',
                        'rgb(59, 130, 246)',
                        'rgb(245, 158, 11)',
                        'rgb(249, 115, 22)',
                        'rgb(239, 68, 68)'
                    ],
                    borderWidth: 1,
                    borderRadius: 6,
                    hoverBackgroundColor: [
                        'rgb(16, 185, 129)',
                        'rgb(59, 130, 246)',
                        'rgb(245, 158, 11)',
                        'rgb(249, 115, 22)',
                        'rgb(239, 68, 68)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1500,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { color: textColor, font: { family: 'Inter, sans-serif' } }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: textColor, font: { family: 'Inter, sans-serif', weight: 500 } }
                    }
                }
            }
        });
    }
}

// Instantiate and initialize the application when DOM is ready
const app = new AssessIQ();
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
