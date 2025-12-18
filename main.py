from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>NanoFit - Hand Control</title>
    <style>
        body {
            background-color: #000;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            overflow: hidden;
        }

        .viewport {
            position: relative;
            width: 100%;
            height: 100%;
            max-width: 800px;
            max-height: 100vh;
            overflow: hidden;
            background: #111;
        }

        video, canvas {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            transform: scaleX(-1); /* Mirror effect */
        }

        /* Status Box */
        #status-box {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            padding: 25px;
            border-radius: 16px;
            text-align: center;
            border: 1px solid #333;
            z-index: 100;
            width: 80%;
            max-width: 300px;
            backdrop-filter: blur(10px);
        }
        #status-title { font-size: 1.4rem; margin-bottom: 10px; color: #0f0; font-weight: bold; }
        #status-desc { color: #ccc; font-size: 1rem; margin-bottom: 20px; }
        
        button {
            border: none;
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s;
        }
        button:active { transform: scale(0.95); }
        #start-btn { background: #007bff; color: white; width: 100%; }

        /* Floating Interface */
        .ui-layer {
            position: absolute;
            bottom: 40px;
            left: 0;
            width: 100%;
            display: flex;
            justify-content: center;
            gap: 15px;
            z-index: 50;
            pointer-events: none;
        }

        .action-btn {
            pointer-events: auto;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            color: white;
            padding: 12px 24px;
            border: 1px solid rgba(255,255,255,0.3);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        #upload-btn { display: none; }
        #remove-btn { background: rgba(255, 60, 60, 0.8); display: none; }
        
        .error-mode #status-title { color: #ff4444 !important; }
        .error-mode { border-color: #ff4444 !important; }

        /* Gesture Hint */
        #gesture-hint {
            position: absolute; top: 20px; left: 0; width: 100%;
            text-align: center; color: rgba(255,255,255,0.6);
            font-size: 0.9rem; pointer-events: none;
            display: none;
        }

    </style>
</head>
<body>

    <div class="viewport">
        <video id="webcam" autoplay playsinline></video>
        <canvas id="output_canvas"></canvas>
        
        <div id="gesture-hint">👌 Pinch fingers to move item</div>

        <div id="status-box">
            <div id="status-title">NanoFit Hands</div>
            <div id="status-desc">Control with your hands</div>
            <button id="start-btn">Start Camera</button>
        </div>

        <input type="file" id="file-input" accept="image/png, image/jpeg" style="display: none;">

        <div class="ui-layer">
            <button id="upload-btn" class="action-btn" onclick="document.getElementById('file-input').click()">
                <span>➕</span> Add Item
            </button>
            <button id="remove-btn" class="action-btn" onclick="clearItem()">
                <span>✖</span> Remove
            </button>
        </div>
    </div>

    <script type="module">
        import { FaceLandmarker, HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

        const video = document.getElementById("webcam");
        const canvas = document.getElementById("output_canvas");
        const ctx = canvas.getContext("2d");
        const statusBox = document.getElementById("status-box");
        const statusTitle = document.getElementById("status-title");
        const statusDesc = document.getElementById("status-desc");
        const startBtn = document.getElementById("start-btn");
        const uploadBtn = document.getElementById("upload-btn");
        const removeBtn = document.getElementById("remove-btn");
        const fileInput = document.getElementById("file-input");
        const gestureHint = document.getElementById("gesture-hint");

        let faceLandmarker = undefined;
        let handLandmarker = undefined;
        let overlayImage = null;
        let lastVideoTime = -1;

        // Interaction State
        let dragOffset = { x: 0, y: 0 };
        let isPinching = false;
        let pinchStartHand = { x: 0, y: 0 };
        let pinchStartOffset = { x: 0, y: 0 };

        // --- 1. SECURITY CHECK ---
        function checkSecurity() {
            if (!window.isSecureContext) {
                statusBox.classList.add("error-mode");
                statusTitle.innerText = "Insecure Connection";
                statusDesc.innerText = "Camera is blocked. Use the Ngrok HTTPS link.";
                startBtn.style.display = "none";
                return false;
            }
            return true;
        }

        // --- 2. START APP (Load 2 Models) ---
        startBtn.onclick = async function() {
            if (!checkSecurity()) return;
            startBtn.disabled = true;
            startBtn.innerText = "Loading AI...";
            statusTitle.innerText = "Initializing...";
            statusDesc.innerText = "Loading Face & Hand Tracking...";
            
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                
                // 1. Load Face Tracker
                faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU"
                    },
                    outputFaceBlendshapes: false,
                    runningMode: "VIDEO",
                    numFaces: 1
                });

                // 2. Load Hand Tracker
                handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2
                });

                statusTitle.innerText = "Starting Camera...";
                startWebcam();

            } catch (err) {
                console.error(err);
                statusTitle.innerText = "Error";
                statusBox.classList.add("error-mode");
                statusDesc.innerText = "Device might be too slow for AI.";
                startBtn.disabled = false;
                startBtn.innerText = "Retry";
            }
        };

        function startWebcam() {
            const constraints = { 
                video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } 
            };
            
            navigator.mediaDevices.getUserMedia(constraints)
                .then((stream) => {
                    video.srcObject = stream;
                    video.addEventListener("loadeddata", () => {
                        statusBox.style.display = "none";
                        uploadBtn.style.display = "flex";
                        renderLoop();
                    });
                })
                .catch((err) => {
                    statusTitle.innerText = "Camera Denied";
                    statusBox.classList.add("error-mode");
                    statusDesc.innerText = "Check settings.";
                    startBtn.disabled = false;
                });
        }

        // --- 3. MAIN LOOP ---
        async function renderLoop() {
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            let startTimeMs = performance.now();
            
            if (faceLandmarker && handLandmarker && lastVideoTime !== video.currentTime) {
                lastVideoTime = video.currentTime;
                
                // Run Detectors
                const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
                const handResults = handLandmarker.detectForVideo(video, startTimeMs);

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // PROCESS HANDS (For Interaction)
                handleGestures(handResults);

                // DRAW FACE
                if (faceResults.faceLandmarks.length > 0 && overlayImage) {
                    drawAccessory(faceResults.faceLandmarks[0]);
                }
            }
            window.requestAnimationFrame(renderLoop);
        }

        // --- 4. GESTURE LOGIC ---
        function handleGestures(handResults) {
            if (!handResults.landmarks || handResults.landmarks.length === 0) {
                isPinching = false;
                return;
            }

            // Check each hand
            for (const landmarks of handResults.landmarks) {
                // Points: 8 = Index Tip, 4 = Thumb Tip
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];

                // Calculate Distance (Pinch)
                const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const isCurrentlyPinching = distance < 0.05; // 5% of screen width threshold

                // Convert to pixels for drag logic
                const handX = ((indexTip.x + thumbTip.x) / 2) * canvas.width;
                const handY = ((indexTip.y + thumbTip.y) / 2) * canvas.height;

                if (isCurrentlyPinching) {
                    ctx.fillStyle = "#0f0"; // Green dot when pinching
                    ctx.beginPath(); ctx.arc(handX, handY, 10, 0, 2*Math.PI); ctx.fill();

                    if (!isPinching) {
                        // START DRAG
                        isPinching = true;
                        pinchStartHand = { x: handX, y: handY };
                        pinchStartOffset = { ...dragOffset };
                    } else {
                        // CONTINUE DRAG
                        // Mirror logic: X movement is inverted
                        const deltaX = (handX - pinchStartHand.x); 
                        const deltaY = (handY - pinchStartHand.y);
                        
                        dragOffset.x = pinchStartOffset.x - deltaX; // Subtract X because of mirror
                        dragOffset.y = pinchStartOffset.y + deltaY;
                    }
                } else {
                    isPinching = false;
                    // Yellow dot when hand detected but not pinching
                    ctx.fillStyle = "rgba(255, 255, 0, 0.5)"; 
                    ctx.beginPath(); ctx.arc(handX, handY, 5, 0, 2*Math.PI); ctx.fill();
                }
            }
        }

        // --- 5. DRAWING ---
        function drawAccessory(landmarks) {
            const leftEye = landmarks[145];
            const rightEye = landmarks[374];
            const lx = leftEye.x * canvas.width;
            const ly = leftEye.y * canvas.height;
            const rx = rightEye.x * canvas.width;
            const ry = rightEye.y * canvas.height;
            const centerX = (lx + rx) / 2;
            const centerY = (ly + ry) / 2;

            // Apply Hand Offset
            const finalX = centerX - dragOffset.x;
            const finalY = centerY + dragOffset.y;

            const eyeDist = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2));
            const angle = Math.atan2(ry - ly, rx - lx);
            const width = eyeDist * 2.5; 
            const ratio = overlayImage.height / overlayImage.width;
            const height = width * ratio;

            ctx.save();
            ctx.translate(finalX, finalY);
            ctx.rotate(angle);
            ctx.drawImage(overlayImage, -width / 2, -height / 2, width, height);
            ctx.restore();
        }

        // --- FILE HANDLING ---
        function handleFile(file) {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => { 
                    overlayImage = img; 
                    removeBtn.style.display = "flex";
                    gestureHint.style.display = "block";
                    dragOffset = { x: 0, y: 0 };
                    setTimeout(() => gestureHint.style.display = "none", 5000);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });
        window.clearItem = () => { 
            overlayImage = null; 
            removeBtn.style.display = "none"; 
            fileInput.value = "";
            dragOffset = { x: 0, y: 0 };
        };

        checkSecurity();
    </script>
</body>
</html>
    """
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)