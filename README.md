# TryOn Web

A real-time virtual try-on application that runs in your browser. It uses **MediaPipe** for face tracking and **Flask** to stream the video feed.

## Features
* **Real-time Face Tracking:** 468 face landmarks for precise positioning.
* **Drag & Drop:** Drag any transparent PNG (sunglasses, masks, etc.) onto the video to wear it.
* **Paste Support:** Copy an image from Google and press `Cmd+V` or your os alternate to wear it instantly.
* **Privacy Focused:** Runs 100% locally on your machine.

## Installation

1.  **Clone the repo**
    ```bash
    git clone [https://github.com/ApewehRexford/TryOn.git](https://github.com/ApewehRexford/TryOn.git)
    cd TryOn
    ```

2.  **Install dependencies**
    ```bash
    pip install -r requirements.txt
    ```

## Usage

1.  **Run the App**
    ```bash
    python main.py
    ```

2.  **Open Browser**
    Go to `http://localhost:8000`

3.  **Try it on!**
    * Drag a PNG file onto the video player.
    * OR copy an image and paste it (`Cmd+V`).
    * Click "Remove Item" to clear.

##  Requirements
* Python 3.9+
* Webcam

---
*Built with OpenCV, MediaPipe, and Flask.*