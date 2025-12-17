from flask import Flask, render_template_string

app = Flask(__name__)

# We no longer process video in Python. 
# Python just serves the webpage to the user.

@app.route('/')
def index():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NanoFit Web (Client Side)</title>
    <style>
        body {
            margin: 0;
            background-color: #111;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }

        h1 { margin-top: 20px; font-weight: 300; letter-spacing: 2px; }
        p { color: #aaa; margin-bottom: 20px; }

        /* The Container */
        .container {
            position: relative;
            width: 100%;
            max-width: 640px;
            aspect-ratio: 4/3;
            border-radius: 16px;
            overflow: hidden;
            border: 3px dashed #444;
            background: #000;
        }

        .container.drag-active { border-color: #0f0; }

        /* Both Video and Canvas sit on top of each other */
        video, canvas {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            /* Flip horizontally for the mirror effect */
            transform: scaleX(-1); 
        }

        /* Loading Spinner */
        #loading {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 1.5rem;
            background: rgba(0,0,0,0.7);
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10;
        }

        /* Controls */
        .controls { margin-top: 20px; display: flex; gap: 10px; }
        button {
            padding: 10px 20px;
            border: none; border-radius: 8px;
            cursor: pointer; font-weight: bold;
            font-size: 1rem;
        }
        .btn-clear { background: #ff4444; color: white; }
        .btn-clear:hover { background: #cc0000; }
        
        .upload-hint {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0, 255, 0, 0.2);
            font-size: 2rem; font-weight: bold;
            opacity: 0; pointer-events: none; transition: opacity 0.2s;
            z-index: 20;
        }
        .drag-active .upload-hint { opacity: 1; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.js" crossorigin="anonymous"></script>
</head>
<body>

    <h1>🔮 NanoFit JS</h1>
    <p>Paste (Cmd+V) or Drag an image here. Runs 100% in browser.</p>

    <div class="container" id="drop-zone">
        <div id="loading">⚡ Loading AI Model...</div>
        <div class="upload-hint">✨ DROP TO WEAR ✨</div>
        <video id="webcam" autoplay playsinline></video>
        <canvas id="output_canvas"></canvas>
    </div>

    <div class="controls">
        <button class="btn-clear" onclick="clearOverlay()">❌ Remove Item</button>
    </div>

    <script type="module">
        import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.js";

        const video = document.getElementById("webcam");
        const canvas = document.getElementById("output_canvas");
        const ctx = canvas.getContext("2d");
        const loadingMsg = document.getElementById("loading");
        
        let faceLandmarker;
        let lastVideoTime = -1;
        let overlayImage = null; // This holds your glasses/mask

        // 1. SETUP AI (MediaPipe)
        async function createFaceLandmarker() {
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
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
            loadingMsg.style.display = "none";
            startWebcam();
        }

        // 2. SETUP WEBCAM
        function startWebcam() {
            navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
                video.srcObject = stream;
                video.addEventListener("loadeddata", predictWebcam);
            });
        }

        // 3. THE MAIN LOOP
        async function predictWebcam() {
            // Resize canvas to match video
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            let startTimeMs = performance.now();
            if (lastVideoTime !== video.currentTime) {
                lastVideoTime = video.currentTime;
                // Detect faces
                if (faceLandmarker) {
                    const results = faceLandmarker.detectForVideo(video, startTimeMs);
                    
                    // Clear canvas
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    // Draw Overlay if we have a face AND an image
                    if (results.faceLandmarks && results.faceLandmarks.length > 0 && overlayImage) {
                        const landmarks = results.faceLandmarks[0];
                        drawOverlay(landmarks);
                    }
                }
            }
            window.requestAnimationFrame(predictWebcam);
        }

        // 4. MATH: Place the image
        function drawOverlay(landmarks) {
            // Get Eye Coordinates
            const leftEye = landmarks[145];  // MediaPipe Point 145
            const rightEye = landmarks[374]; // MediaPipe Point 374

            // Convert normalized coordinates (0-1) to pixel coordinates
            const lx = leftEye.x * canvas.width;
            const ly = leftEye.y * canvas.height;
            const rx = rightEye.x * canvas.width;
            const ry = rightEye.y * canvas.height;

            // Calculate Center, Rotation, and Width
            const centerX = (lx + rx) / 2;
            const centerY = (ly + ry) / 2;
            
            // Distance between eyes
            const eyeDist = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2));
            
            // Scale multiplier (2.5x distance between eyes is a good fit for glasses)
            const width = eyeDist * 2.5; 
            
            // Rotation angle
            const angle = Math.atan2(ry - ly, rx - lx);

            // Maintain Aspect Ratio of the image
            const ratio = overlayImage.height / overlayImage.width;
            const height = width * ratio;

            // Draw rotated image
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.drawImage(overlayImage, -width / 2, -height / 2, width, height);
            ctx.restore();
        }

        // 5. DRAG & DROP + PASTE HANDLERS
        const dropZone = document.getElementById('drop-zone');

        // Drag Visuals
        window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
        window.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
        window.addEventListener('drop', (e) => { 
            e.preventDefault(); 
            dropZone.classList.remove('drag-active');
            if (e.dataTransfer.files.length > 0) loadImage(e.dataTransfer.files[0]);
        });

        // Paste Handler
        window.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.kind === 'file') {
                    dropZone.classList.add('drag-active');
                    setTimeout(() => dropZone.classList.remove('drag-active'), 500);
                    loadImage(item.getAsFile());
                }
            }
        });

        function loadImage(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => { overlayImage = img; };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // Expose clear function to global scope for the button
        window.clearOverlay = () => { overlayImage = null; };

        // START
        createFaceLandmarker();
    </script>
</body>
</html>
    """

if __name__ == "__main__":
    # Host 0.0.0.0 is required for ngrok/external access
    app.run(host='0.0.0.0', port=8000, debug=True)