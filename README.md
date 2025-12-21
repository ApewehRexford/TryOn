# TryOn - Spatial Virtual Try-On

TryOn is an open-source AI virtual try-on tool that uses Spatial Computing. It runs entirely in the browser using MediaPipe, allowing users to try on glasses, masks, or accessories using hand gestures and face movements.

## Key Features

### Spatial Intelligence
* Hand Tracking: Use your fingers to grab, move, and adjust items in mid-air.
* Two-Hand Zoom: Pinch with both hands to resize items.

### Face Gestures
* Mouth Switch: Open your mouth wide to instantly change the color or style of the item.
* Fake 3D: The item tilts and adjusts realistically when you turn your head.

### Smart Selfie
* Peace Sign Trigger: Flash a peace sign to start a 3-second countdown and auto-save a photo.

---

## Quick Start

### 1. Install Dependencies
Make sure you have Python installed, then run:
pip install -r requirements.txt

### 2. Run the App
Start the local server:
python main.py

### 3. Go Public (For Mobile)
To test on your phone, you must tunnel the connection (because cameras require HTTPS):
ngrok http 8000

Copy the HTTPS link provided by Ngrok and send it to your phone.

---

## How to Use

Action: Add Item
Method: Button
Description: Tap "Add Item" to upload a transparent PNG.

Action: Move
Method: Pinch (1 Hand)
Description: Pinch your thumb and index finger to grab and drag.

Action: Zoom
Method: Pinch (2 Hands)
Description: Pinch with both hands and pull apart to resize.

Action: Change Color
Method: Open Mouth
Description: Open your mouth wide (more than 40 percent) to cycle colors.

Action: Take Photo
Method: Peace Sign
Description: Hold a peace sign for 2 seconds to take a selfie.

---

## Tech Stack
* Backend: Python (Flask)
* Frontend: HTML5, CSS3, JavaScript (ES6 Modules)
* AI Engine: Google MediaPipe (Face Landmarker + Hand Landmarker)

## License
This project is open-source. Feel free to use and modify!