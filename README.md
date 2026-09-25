# XENO · Alien Hand Interface

Real-time hand tracking that turns your webcam into alien technology. Four "dimensions" are driven entirely by your hands: an instrument tuned to a non-human scale, a portal that shows the world through alien eyes, zero-gravity relics you can grab and fling into a black hole, and a creature that watches your fingers. Everything runs in the browser, on-device; no video leaves your machine.

## Dimensions

| # | Mode | What it does |
|---|---|---|
| 1 | **Resonator** | An alien synth. **Right hand height** sets pitch on the **Bohlen–Pierce scale** (13 steps per 3:1 "tritave" instead of 12 per octave, a real tuning system that sounds non-human). **Right hand left/right** sets filter brightness. **Left thumb–index spread** sets volume, and the **number of raised left fingers (0–5)** picks the drum pattern density (kick, snare, hat, alien zaps). A **right fist** silences it. On screen: live waveform, a 16-step sequencer, and a standing-wave "resonance string" between your index fingers whose node count follows the note. |
| 2 | **Portal** | **Frame a window** with both thumbs and index fingers. Inside it, a WebGL shader shows the camera through an alien lens: **Thermal** (iron-bow false colour), **Xeno X-ray** (Sobel edge detection), **Cloak** (Predator-style refraction with chromatic aberration) or **Void** (nebula plus your edge outline). **Thumbs up** with one hand, or `L`, cycles lenses. |
| 3 | **Artifacts** | Procedural alien relics floating in zero gravity: a breathing seed pod (noise-displaced mesh), a glyph monolith, a gyroscope, a bio-orb and orbiting shards. **Pinch** to grab and drag (twist your hand to rotate it), and release to fling it drifting. **Pinch the same relic with both hands** to scale and rotate it. **Hold an open palm** to open a rift and summon the next relic. **Throw a relic into the singularity** (bottom right) and it spirals in and is destroyed. `C` clears. |
| 4 | **Entity** | A procedural alien jellyfish whose **eye follows your index finger**. **Open palm**: it gets curious, swims over and reaches for you. **Fist**: it recoils in fear and curls up. **Pinch** to drag, rotate or scale it (choose the tool with the side buttons or `G`/`R`/`S`). **Pinch with both hands** to scale and roll it. **🎙 Voice** (`V`): say *drag, rotate, scale, reset, colour, spin, dance, come here, sleep, wake, hello*, and it chirps back. |

**Switching dimensions:** hold the 🤟 sign ("I love you", the alien salute) for 0.7 s, press `1`–`4`, or click the tabs.

Other keys: `H` toggles the HUD and `P` saves a snapshot.

## Quick Start

```
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Open http://localhost:8000, click **Establish link** and allow the camera. Turn your sound on for the Resonator and the Entity's chirps.

* `PORT=xxxx` changes the port. `FLASK_DEBUG=1` enables debug mode; **never use it while tunnelling**, because the Werkzeug debugger allows remote code execution.
* **On a phone:** cameras need HTTPS, so run `ngrok http 8000` and open the HTTPS link.
* Voice commands use the browser's Speech Recognition (Chrome, Edge, Safari).

## How it works

* **Hand tracking:** MediaPipe Gesture Recognizer (WebAssembly + WebGL, CPU fallback) gives 21 landmarks per hand (up to 2), 3D world landmarks, handedness and a gesture class every frame.
* **Hand state** (`core/hands.js`): palm centre, palm size (used to make every threshold scale-invariant), velocity, a **pinch with hysteresis** smoothed by a **One Euro filter**, extended-finger detection, a 3D orientation basis from the world landmarks, and gesture hold timing for one-shot triggers.
* **Rendering:** a single canvas in a mirrored transform, so model coordinates stay in raw image space and snapshots match the screen. 3D modes use three.js with an orthographic camera in image pixel space, composited into the canvas. Portal uses its own WebGL fragment shader. Audio is the Web Audio API with a look-ahead scheduler for tight drum timing.

```
main.py                    Flask static server
static/
  index.html               Boot screen, HUD, tabs, three.js import map
  css/style.css
  js/
    main.js                Camera, model, frame loop, mode switching, HUD
    core/
      hands.js             Hand tracker (pinch, fingers, orientation, velocity)
      render2d.js          Colour-graded background, alien hand skeleton, labels
      scene3d.js           Shared three.js pixel-space scene + fresnel shader + noise
      glyphs.js            Alien alphabet + decode effect
      one-euro.js          One Euro filter
    modes/
      resonator.js         Bohlen–Pierce synth + drum sequencer
      portal.js            Fingertip-framed alien-vision shader
      artifacts.js         Zero-g relics, grab / fling / two-hand transform, singularity
      entity.js            Procedural creature, behaviours, voice commands
```

Mode modules are lazy-loaded, so three.js is only fetched when you open Artifacts or Entity.

## Troubleshooting

* **Nothing reacts:** the HUD's `hands` line shows what the model sees, with the live gesture per hand. Keep your whole hand in frame, with good light.
* **No sound:** check the tab isn't muted. Audio starts on the **Establish link** click.
* **Portal won't open:** both hands must be visible. The window is spanned by the two thumbs and two index fingers.
* **Voice doesn't work:** Chrome, Edge or Safari only. Allow microphone access when prompted.

## Tech Stack
* Python (Flask) static server
* HTML5 Canvas, WebGL (GLSL), Web Audio, Web Speech, ES modules (no build step)
* MediaPipe Tasks Vision 1.0.1 (Gesture Recognizer)
* three.js 0.186
