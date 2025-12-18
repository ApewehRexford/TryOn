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
    <title>TryOn</title>
    <style>
        body {
            background-color: #000;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
            transform: scaleX(-1);
        }

        /* Status Box */
        #status-box {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            padding: 30px;
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
        
        /* Error State */
        .error-mode #status-title { color: #ff4444 !important; }
        .error-mode { border-color: #ff4444 !important; }

    </style>
</head>
<body>

    <div class="viewport">
        <video id="webcam" autoplay playsinline></video>
        <canvas id="output_canvas"></canvas>
        
        <div id="status-box">
            <div id="status-title">TryOn</div>
            <div id="status-desc">Virtual Try-On Experience</div>
            <button id="start-btn">Start Camera</button>
        </div>

        <input type="file" id="file-input" accept="image/png, image/jpeg" style="display: none;">

        <div class="ui-layer">
            <button id="upload-btn" class="action-btn" onclick="document.getElementById('file-input').click()">
                <span>➕</span> Choose Item
            </button>
            <button id="remove-btn" class="action-btn" onclick="clearItem()">
                <span>✖</span> Remove
            </button>
        </div>
    </div>

    <script type="module">
        import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

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

        let faceLandmarker = undefined;
        let overlayImage = null;
        let lastVideoTime = -1;

        // --- 1. SECURITY CHECK (Fixes the "Undefined" Error) ---
        function checkSecurity() {
            // Check if context is secure (HTTPS or Localhost)
            if (!window.isSecureContext) {
                statusBox.classList.add("error-mode");
                statusTitle.innerText = "Insecure Connection";
                statusDesc.innerText = "Camera is blocked. You MUST use the Ngrok HTTPS link.";
                startBtn.style.display = "none";
                return false;
            }
            return true;
        }

        // --- 2. START APP ---
        startBtn.onclick = async function() {
            if (!checkSecurity()) return;
            
            startBtn.disabled = true;
            startBtn.innerText = "Loading...";
            statusTitle.innerText = "Getting things Ready...";
            statusDesc.innerText = "Almost done...";
            
            try {
                const filesetResolver = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                
                faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                        delegate: "GPU"
                    },
                    outputFaceBlendshapes: false,
                    runningMode: "VIDEO",
                    numFaces: 1
                });

                statusTitle.innerText = "Starting Camera...";
                startWebcam();

            } catch (err) {
                console.error(err);
                statusTitle.innerText = "Error";
                statusBox.classList.add("error-mode");
                statusDesc.innerText = "Could not load AI.";
                startBtn.disabled = false;
                startBtn.innerText = "Retry";
            }
        };

        function startWebcam() {
            const constraints = { 
                video: { 
                    facingMode: "user", // Front camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            };
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                statusBox.classList.add("error-mode");
                statusTitle.innerText = "Camera Blocked";
                statusDesc.innerText = "Browser denied access. Use Safari/Chrome on HTTPS.";
                return;
            }

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
                    statusDesc.innerText = "Please allow camera access in Settings.";
                    startBtn.disabled = false;
                    startBtn.innerText = "Retry";
                });
        }

        async function renderLoop() {
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            let startTimeMs = performance.now();
            if (faceLandmarker && lastVideoTime !== video.currentTime) {
                lastVideoTime = video.currentTime;
                const results = faceLandmarker.detectForVideo(video, startTimeMs);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (results.faceLandmarks && results.faceLandmarks.length > 0 && overlayImage) {
                    drawAccessory(results.faceLandmarks[0]);
                }
            }
            window.requestAnimationFrame(renderLoop);
        }

        function drawAccessory(landmarks) {
            const leftEye = landmarks[145];
            const rightEye = landmarks[374];
            const lx = leftEye.x * canvas.width;
            const ly = leftEye.y * canvas.height;
            const rx = rightEye.x * canvas.width;
            const ry = rightEye.y * canvas.height;
            const centerX = (lx + rx) / 2;
            const centerY = (ly + ry) / 2;
            const eyeDist = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2));
            const angle = Math.atan2(ry - ly, rx - lx);
            const width = eyeDist * 2.5; 
            const ratio = overlayImage.height / overlayImage.width;
            const height = width * ratio;
            ctx.save();
            ctx.translate(centerX, centerY);
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
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });
        window.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.kind === 'file') handleFile(item.getAsFile());
            }
        });

        // Global functions for buttons
        window.clearItem = () => { 
            overlayImage = null; 
            removeBtn.style.display = "none"; 
            fileInput.value = "";
        };

        // Initial check
        checkSecurity();
    </script>
</body>
</html>
    """
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)