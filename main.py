from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NanoFit - Final</title>
    <style>
        body {
            background-color: #000;
            color: white;
            font-family: 'Courier New', Courier, monospace;
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
            max-width: 800px;
            aspect-ratio: 4/3;
            border: 2px solid #333;
            border-radius: 12px;
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

        #status-box {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #555;
            z-index: 100;
            max-width: 80%;
        }
        #status-title { font-size: 1.2rem; margin-bottom: 10px; color: #0f0; }
        #status-desc { color: #ccc; font-size: 0.9rem; }
        
        #start-btn {
            background: #007bff; color: white; border: none;
            padding: 10px 20px; font-size: 1rem; border-radius: 5px;
            cursor: pointer; margin-top: 10px;
        }
    </style>
</head>
<body>

    <div class="viewport">
        <video id="webcam" autoplay playsinline></video>
        <canvas id="output_canvas"></canvas>
        
        <div id="status-box">
            <div id="status-title">Ready</div>
            <div id="status-desc">Click start to enable camera</div>
            <button id="start-btn" onclick="initApp()">START CAMERA</button>
        </div>
    </div>

    <script type="module">
        // USES VERSION 0.10.0 (Guaranteed Stable)
        import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";

        const video = document.getElementById("webcam");
        const canvas = document.getElementById("output_canvas");
        const ctx = canvas.getContext("2d");
        const statusBox = document.getElementById("status-box");
        const statusTitle = document.getElementById("status-title");
        const statusDesc = document.getElementById("status-desc");
        const startBtn = document.getElementById("start-btn");

        let faceLandmarker = undefined;
        let overlayImage = null;
        let lastVideoTime = -1;

        window.initApp = async function() {
            startBtn.style.display = "none";
            statusTitle.innerText = "Downloading AI...";
            statusDesc.innerText = "Please wait...";
            
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
                statusTitle.style.color = "red";
                statusDesc.innerText = "Ensure you are on localhost:8000";
            }
        };

        function startWebcam() {
            navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
                .then((stream) => {
                    video.srcObject = stream;
                    video.addEventListener("loadeddata", () => {
                        statusBox.style.display = "none";
                        renderLoop();
                    });
                })
                .catch((err) => {
                    statusTitle.innerText = "Camera Denied";
                    statusTitle.style.color = "red";
                    statusDesc.innerText = "You blocked the camera.";
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

        function handleFile(file) {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => { overlayImage = img; };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

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
    </script>
</body>
</html>
    """
    
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)