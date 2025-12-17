from flask import Flask, render_template_string, Response, request, jsonify
import cv2
import cvzone
import mediapipe as mp
import os
import time

app = Flask(__name__)

# --- CONFIGURATION ---
WATCH_FOLDER = "items"
# ---------------------

# Setup Face Detector (MediaPipe)
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

if not os.path.exists(WATCH_FOLDER):
    os.makedirs(WATCH_FOLDER)

# Global State to control the overlay
APP_STATE = {
    'show_overlay': True,  # Default to showing it
    'force_reload': False  # Signal to reload image
}

# --- 1. THE CAMERA LOOP ---
# --- 1. THE CAMERA LOOP ---
def generate_frames():
    cap = cv2.VideoCapture(1) 
    
    current_overlay = None
    last_mod_time = 0
    
    while True:
        # Check for new items (Hot Reload logic remains same...)
        if APP_STATE['show_overlay']:
            try:
                files = [f for f in os.listdir(WATCH_FOLDER) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
                if files:
                    latest_file = max([os.path.join(WATCH_FOLDER, f) for f in files], key=os.path.getmtime)
                    mod_time = os.path.getmtime(latest_file)
                    if mod_time != last_mod_time or APP_STATE['force_reload']:
                        img_load = cv2.imread(latest_file, cv2.IMREAD_UNCHANGED)
                        if img_load is not None:
                            if img_load.shape[2] == 3: 
                                img_load = cv2.cvtColor(img_load, cv2.COLOR_BGR2BGRA)
                            current_overlay = img_load
                            last_mod_time = mod_time
                            APP_STATE['force_reload'] = False 
            except Exception:
                pass
        else:
            current_overlay = None

        success, img = cap.read()
        if not success:
            break

        # --- UN-MIRROR THE CAMERA ---
        # 1 means horizontal flip. By flipping it once, we reverse the mirror effect.
        img = cv2.flip(img, 1) 
        # ----------------------------

        # AI Processing
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(img_rgb)

        if results.multi_face_landmarks and current_overlay is not None and APP_STATE['show_overlay']:
            face_landmarks = results.multi_face_landmarks[0]
            h_screen, w_screen, _ = img.shape
            
            def get_point(idx):
                lm = face_landmarks.landmark[idx]
                return (int(lm.x * w_screen), int(lm.y * h_screen))

            left_eye = get_point(145)
            right_eye = get_point(374)

            dist = ((left_eye[0] - right_eye[0])**2 + (left_eye[1] - right_eye[1])**2)**0.5
            W = int(dist * 2.8) 
            
            h_overlay, w_overlay, _ = current_overlay.shape
            H = int(W * (h_overlay / w_overlay))
            
            try:
                overlay_resize = cv2.resize(current_overlay, (W, H))
                center_x = left_eye[0] + (right_eye[0] - left_eye[0]) // 2
                center_y = left_eye[1]
                top_left = (center_x - W//2, center_y - H//2)
                img = cvzone.overlayPNG(img, overlay_resize, top_left)
            except Exception:
                pass 

        ret, buffer = cv2.imencode('.jpg', img)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
# --- 2. WEB ROUTES ---

@app.route('/')
def index():
    return """
    <html>
    <head>
        <title>NanoFit Web</title>
        <style>
            body { 
                background-color: #111; color: white; text-align: center; 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                margin: 0; padding: 20px;
                height: 100vh;
                box-sizing: border-box;
            }
            h1 { margin-bottom: 10px; font-weight: 300; letter-spacing: 2px; }
            
            #drop-zone {
                position: relative;
                width: 80%;
                max-width: 800px;
                margin: 0 auto;
                border: 4px dashed #444;
                border-radius: 15px;
                overflow: hidden;
                transition: border-color 0.3s;
            }
            
            #video-feed { width: 100%; display: block; }

            #overlay-msg {
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 255, 0, 0.2); color: white;
                display: flex; align-items: center; justify_content: center;
                font-size: 2em; font-weight: bold; opacity: 0;
                pointer-events: none; transition: opacity 0.3s;
            }

            #drop-zone.drag-active { border-color: #0f0; }
            #drop-zone.drag-active #overlay-msg { opacity: 1; }
            
            /* BUTTON STYLE */
            .btn-clear {
                margin-top: 20px;
                background-color: #ff4444;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .btn-clear:hover { background-color: #cc0000; }

        </style>
    </head>
    <body>
        <h1>🔮 NanoFit</h1>
        <p>Drag & Drop / Paste to Wear • Click below to Clear</p>
        
        <div id="drop-zone">
            <div id="overlay-msg">✨ UPLOADING... ✨</div>
            <img id="video-feed" src="/video_feed">
        </div>
        
        <button class="btn-clear" onclick="clearOverlay()">❌ Remove Item</button>

        <script>
            const dropZone = document.getElementById('drop-zone');
            
            // --- CLEAR FUNCTION ---
            function clearOverlay() {
                fetch('/clear')
                .then(response => console.log('Overlay Cleared'));
            }

            // --- DRAG & DROP & PASTE ---
            window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
            window.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-active'); });
            window.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-active'); if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]); });
            
            window.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let index in items) {
                    if (items[index].kind === 'file') {
                        dropZone.classList.add('drag-active');
                        setTimeout(() => dropZone.classList.remove('drag-active'), 500);
                        uploadFile(items[index].getAsFile());
                    }
                }
            });

            function uploadFile(file) {
                const formData = new FormData();
                const fileName = file.name || "pasted_image.png"; 
                formData.append('file', file, fileName);
                fetch('/upload', { method: 'POST', body: formData });
            }
        </script>
    </body>
    </html>
    """

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'No file'}), 400

    if file:
        save_name = file.filename
        if save_name == "blob": save_name = f"pasted_{int(time.time())}.png"
        filepath = os.path.join(WATCH_FOLDER, save_name)
        file.save(filepath)
        
        # Turn the overlay back ON
        APP_STATE['show_overlay'] = True
        APP_STATE['force_reload'] = True
        
        return jsonify({'message': 'Uploaded!'})

@app.route('/clear')
def clear_overlay():
    # Turn the overlay OFF
    APP_STATE['show_overlay'] = False
    return jsonify({'status': 'cleared'})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)