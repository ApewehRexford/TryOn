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
    <title>TryOn - Ultimate</title>
    <style>
        body {
            background-color: #000;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            height: 100vh; margin: 0; overflow: hidden;
        }

        .viewport {
            position: relative; width: 100%; height: 100%;
            max-width: 800px; max-height: 100vh;
            overflow: hidden; background: #111;
        }

        video, canvas {
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            transform: scaleX(-1); /* Mirror */
        }

        /* Flash Effect for Selfie */
        #flash-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: white; opacity: 0; pointer-events: none;
            transition: opacity 0.1s; z-index: 200;
        }

        #status-box {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85); padding: 25px;
            border-radius: 16px; text-align: center;
            border: 1px solid #333; z-index: 100;
            width: 80%; max-width: 300px; backdrop-filter: blur(10px);
        }
        #status-title { font-size: 1.4rem; margin-bottom: 10px; color: #0f0; font-weight: bold; }
        #status-desc { color: #ccc; font-size: 1rem; margin-bottom: 20px; }
        
        button {
            border: none; padding: 15px 30px; border-radius: 50px;
            font-size: 1.1rem; font-weight: 600; cursor: pointer;
            transition: transform 0.1s;
        }
        button:active { transform: scale(0.95); }
        #start-btn { background: #007bff; color: white; width: 100%; }

        .ui-layer {
            position: absolute; bottom: 40px; left: 0; width: 100%;
            display: flex; justify-content: center; gap: 15px;
            z-index: 50; pointer-events: none;
        }

        .action-btn {
            pointer-events: auto; background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px); color: white;
            padding: 12px 24px; border: 1px solid rgba(255,255,255,0.3);
            display: flex; align-items: center; gap: 8px;
        }
        
        #upload-btn { display: none; }
        #remove-btn { background: rgba(255, 60, 60, 0.8); display: none; }
        .error-mode #status-title { color: #ff4444 !important; }
        .error-mode { border-color: #ff4444 !important; }

        #gesture-hint {
            position: absolute; top: 20px; left: 0; width: 100%;
            text-align: center; color: rgba(255,255,255,0.8);
            font-size: 0.9rem; pointer-events: none; display: none;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8); line-height: 1.5;
        }
    </style>
</head>
<body>

    <div class="viewport">
        <video id="webcam" autoplay playsinline></video>
        <canvas id="output_canvas"></canvas>
        <div id="flash-overlay"></div>
        
        <div id="gesture-hint">
            😲 Open Mouth: Change Color<br>
            ✌️ Peace Sign: Take Selfie<br>
            🙌 Pinch 2 Hands: Zoom
        </div>

        <div id="status-box">
            <div id="status-title">TryOn Ultimate</div>
            <div id="status-desc">Face + Hand + Gestures</div>
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
        const flashOverlay = document.getElementById("flash-overlay");

        let faceLandmarker, handLandmarker;
        let overlayImage = null;
        let lastVideoTime = -1;

        // --- INTERACTION STATE ---
        let dragOffset = { x: 0, y: 0 };
        let scaleMultiplier = 1.0;
        let rotationHue = 0; // For Mouth Switch
        
        // Flags
        let isDragging = false, isZooming = false;
        let pinchStartHand = { x: 0, y: 0 }, pinchStartOffset = { x: 0, y: 0 };
        let zoomStartDist = 0, zoomStartScale = 1.0;
        
        // Cooldowns
        let lastSelfieTime = 0;
        let isMouthOpen = false;

        function checkSecurity() {
            if (!window.isSecureContext) {
                statusBox.classList.add("error-mode");
                statusTitle.innerText = "Insecure Connection";
                statusDesc.innerText = "Use Ngrok HTTPS link.";
                startBtn.style.display = "none";
                return false;
            }
            return true;
        }

        startBtn.onclick = async function() {
            if (!checkSecurity()) return;
            startBtn.disabled = true; startBtn.innerText = "Loading AI...";
            statusTitle.innerText = "Initializing...";
            
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                
                faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU"
                    },
                    outputFaceBlendshapes: true, // Needed for Mouth
                    runningMode: "VIDEO", numFaces: 1
                });

                handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO", numHands: 2
                });

                statusTitle.innerText = "Starting Camera...";
                startWebcam();
            } catch (err) {
                console.error(err);
                statusTitle.innerText = "Error"; statusBox.classList.add("error-mode");
                startBtn.disabled = false;
            }
        };

        function startWebcam() {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } })
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
                });
        }

        async function renderLoop() {
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            let startTimeMs = performance.now();
            
            if (faceLandmarker && handLandmarker && lastVideoTime !== video.currentTime) {
                lastVideoTime = video.currentTime;
                
                const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
                const handResults = handLandmarker.detectForVideo(video, startTimeMs);

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // 1. HAND GESTURES (Move, Zoom, Selfie)
                handleHands(handResults);

                // 2. FACE LOGIC (Draw, Mouth Switch, 3D Turn)
                if (faceResults.faceLandmarks.length > 0 && overlayImage) {
                    handleFace(faceResults.faceLandmarks[0], faceResults.faceBlendshapes[0]);
                }
            }
            window.requestAnimationFrame(renderLoop);
        }

        // --- HAND LOGIC (Selfie & Pinch) ---
        function handleHands(results) {
            if (!results.landmarks) return;

            let pinchingHands = [];
            let peaceSignDetected = false;

            for (const landmarks of results.landmarks) {
                // Check Pinch (Thumb & Index close)
                const pinchDist = Math.hypot(landmarks[8].x - landmarks[4].x, landmarks[8].y - landmarks[4].y);
                if (pinchDist < 0.05) {
                    pinchingHands.push({ 
                        x: ((landmarks[8].x + landmarks[4].x)/2) * canvas.width, 
                        y: ((landmarks[8].y + landmarks[4].y)/2) * canvas.height 
                    });
                }

                // Check Peace Sign (Index & Middle UP, others DOWN)
                if (landmarks[8].y < landmarks[6].y && // Index Up
                    landmarks[12].y < landmarks[10].y && // Middle Up
                    landmarks[16].y > landmarks[14].y && // Ring Down
                    landmarks[20].y > landmarks[18].y) { // Pinky Down
                    peaceSignDetected = true;
                }
            }

            // SELFIE TRIGGER
            if (peaceSignDetected && (Date.now() - lastSelfieTime > 2000)) {
                triggerSelfie();
            }

            // ZOOM & DRAG
            if (pinchingHands.length === 2) {
                isDragging = false;
                const currDist = Math.hypot(pinchingHands[0].x - pinchingHands[1].x, pinchingHands[0].y - pinchingHands[1].y);
                if (!isZooming) { isZooming = true; zoomStartDist = currDist; zoomStartScale = scaleMultiplier; }
                else { scaleMultiplier = Math.max(0.2, Math.min(zoomStartScale * (currDist / zoomStartDist), 5.0)); }
                
                // Draw Zoom Line
                ctx.strokeStyle = "#00aaff"; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(pinchingHands[0].x, pinchingHands[0].y); 
                ctx.lineTo(pinchingHands[1].x, pinchingHands[1].y); ctx.stroke();

            } else if (pinchingHands.length === 1) {
                isZooming = false;
                if (!isDragging) { isDragging = true; pinchStartHand = pinchingHands[0]; pinchStartOffset = {...dragOffset}; }
                else { dragOffset.x = pinchStartOffset.x - (pinchingHands[0].x - pinchStartHand.x); dragOffset.y = pinchStartOffset.y + (pinchingHands[0].y - pinchStartHand.y); }
            } else {
                isDragging = false; isZooming = false;
            }
        }

        // --- FACE LOGIC (Draw, Mouth, 3D) ---
        function handleFace(landmarks, blendshapes) {
            // 1. MOUTH SWITCH (Jaw Open > 0.4)
            const jawOpen = blendshapes.categories.find(c => c.categoryName === 'jawOpen').score;
            
            if (jawOpen > 0.4) {
                if (!isMouthOpen) {
                    rotationHue = (rotationHue + 45) % 360; // Change color
                    isMouthOpen = true;
                }
            } else {
                isMouthOpen = false;
            }

            // 2. FAKE 3D (YAW CALCULATION)
            const leftEar = landmarks[234];
            const rightEar = landmarks[454];
            const nose = landmarks[1];
            
            const distLeft = Math.abs(nose.x - leftEar.x);
            const distRight = Math.abs(nose.x - rightEar.x);
            const ratio = distLeft / (distRight + 0.001); 
            
            let scaleX3D = 1.0;
            if (ratio > 1.5 || ratio < 0.6) scaleX3D = 0.75; // Squish if turning

            // 3. DRAW
            const lx = landmarks[145].x * canvas.width;
            const ly = landmarks[145].y * canvas.height;
            const rx = landmarks[374].x * canvas.width;
            const ry = landmarks[374].y * canvas.height;

            const centerX = (lx + rx) / 2 - dragOffset.x;
            const centerY = (ly + ry) / 2 + dragOffset.y;

            const eyeDist = Math.hypot(rx - lx, ry - ly);
            const angle = Math.atan2(ry - ly, rx - lx);
            const width = (eyeDist * 2.5) * scaleMultiplier;
            const height = width * (overlayImage.height / overlayImage.width);

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            
            // Apply 3D Squish & Mouth Color
            ctx.scale(scaleX3D, 1); 
            ctx.filter = `hue-rotate(${rotationHue}deg)`;

            ctx.drawImage(overlayImage, -width/2, -height/2, width, height);
            ctx.restore();
        }

        function triggerSelfie() {
            lastSelfieTime = Date.now();
            
            // Flash Effect
            flashOverlay.style.opacity = 1;
            setTimeout(() => flashOverlay.style.opacity = 0, 150);

            // Wait for flash to clear, then save
            setTimeout(() => {
                const link = document.createElement('a');
                link.download = `tryon_selfie_${Date.now()}.png`; // Renamed file
                // Combine video + canvas for save
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                tempCtx.translate(canvas.width, 0); tempCtx.scale(-1, 1); // Mirror video
                tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
                tempCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset for overlay
                tempCtx.drawImage(canvas, 0, 0);
                
                link.href = tempCanvas.toDataURL();
                link.click();
            }, 200);
        }

        function handleFile(file) {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => { 
                    overlayImage = img; 
                    removeBtn.style.display = "flex";
                    gestureHint.style.display = "block";
                    setTimeout(() => gestureHint.style.display = "none", 8000);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        fileInput.addEventListener('change', (e) => { if(e.target.files.length) handleFile(e.target.files[0]); });
        window.clearItem = () => { overlayImage = null; removeBtn.style.display = "none"; fileInput.value = ""; dragOffset = {x:0,y:0}; scaleMultiplier = 1.0; rotationHue = 0; };

        checkSecurity();
    </script>
</body>
</html>
    """
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)