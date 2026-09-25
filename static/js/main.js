import { GestureRecognizer, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { HandTracker } from "./core/hands.js";
import { drawBackground, drawHands, drawLabels } from "./core/render2d.js";
import { decode, toGlyphs } from "./core/glyphs.js";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const SHIFT_HOLD_MS = 700;   // 🤟 held this long switches mode

const MODES = [
    { id: "resonator", name: "Resonator", load: () => import("./modes/resonator.js") },
    { id: "portal", name: "Portal", load: () => import("./modes/portal.js") },
    { id: "artifacts", name: "Artifacts", load: () => import("./modes/artifacts.js") },
    { id: "entity", name: "Entity", load: () => import("./modes/entity.js") },
];

const $ = (id) => document.getElementById(id);
const video = $("webcam"), canvas = $("stage"), ctx = canvas.getContext("2d");
const boot = $("boot"), bootBtn = $("boot-btn"), bootStatus = $("boot-status");
const hud = $("hud"), hudTitle = $("hud-title"), hudGlyph = $("hud-glyph"), hudStats = $("hud-stats");
const tabs = $("tabs"), hint = $("hint"), toastEl = $("toast"), viewport = $("viewport");

const tracker = new HandTracker();
let recognizer, delegate = "GPU";
let modeIndex = -1, mode = null, switching = false;
const instances = new Map();
let lastVideoTime = -1, lastFrame = 0, fps = 0, lastHud = 0, titleAt = 0;

let toastTimer;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
}

const env = { audio: null, tracker, ui: $("mode-ui"), toast };

async function createRecognizer(fileset) {
    const opts = (d) => ({ baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: d }, runningMode: "VIDEO", numHands: 2 });
    try {
        return await GestureRecognizer.createFromOptions(fileset, opts("GPU"));
    } catch (err) {
        console.warn("GPU delegate failed, using CPU", err);
        delegate = "CPU";
        return GestureRecognizer.createFromOptions(fileset, opts("CPU"));
    }
}

bootBtn.addEventListener("click", async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        bootStatus.textContent = "Camera needs HTTPS or localhost.";
        return;
    }
    bootBtn.disabled = true;
    // Audio must be created inside a user gesture.
    env.audio = new (window.AudioContext || window.webkitAudioContext)();
    try {
        bootStatus.textContent = "establishing neural link…";
        recognizer = await createRecognizer(await FilesetResolver.forVisionTasks(WASM_ROOT));
        bootStatus.textContent = "opening optical sensor…";
        video.srcObject = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        await video.play();
    } catch (err) {
        console.error(err);
        bootStatus.textContent = err?.name === "NotAllowedError" ? "Camera access denied." : `Link failed: ${err?.message || err}`;
        bootBtn.disabled = false;
        return;
    }
    boot.hidden = true;
    hud.hidden = false;
    tabs.hidden = false;
    hint.hidden = false;
    await switchMode(0);
    requestAnimationFrame(loop);
});

async function switchMode(i) {
    if (switching || i === modeIndex) return;
    switching = true;
    try {
        const def = MODES[i];
        if (!instances.has(def.id)) {
            toast(`loading ${def.name}…`);
            const Mod = (await def.load()).default;
            instances.set(def.id, new Mod(env));
        }
        mode?.deactivate();
        env.ui.innerHTML = "";
        modeIndex = i;
        mode = instances.get(def.id);
        mode.activate();
        hint.textContent = mode.hint;
        titleAt = performance.now();
        tabs.querySelectorAll("button").forEach((b, k) => b.classList.toggle("active", k === i));
        viewport.classList.remove("shift");
        void viewport.offsetWidth;   // restart the CSS glitch animation
        viewport.classList.add("shift");
    } catch (err) {
        console.error(err);
        toast(`Couldn't load ${MODES[i].name}`);
    } finally {
        switching = false;
    }
}

tabs.innerHTML = MODES.map((m, i) => `<button data-i="${i}"><span class="glyph">${toGlyphs(m.name)}</span>${i + 1} · ${m.name}</button>`).join("");
tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) switchMode(Number(b.dataset.i));
});

window.addEventListener("keydown", (e) => {
    if (boot.hidden === false) return;
    const k = e.key.toLowerCase();
    if (["1", "2", "3", "4"].includes(k)) switchMode(Number(k) - 1);
    else if (k === "h") hud.hidden = !hud.hidden;
    else if (k === "p") snapshot();
    else mode?.onKey?.(k);
});

function snapshot() {
    canvas.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `xeno_${MODES[modeIndex].id}_${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast("snapshot saved");
    });
}

function loop() {
    requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    try {
        frame();
    } catch (err) {
        console.error("frame error", err);
    }
}

function frame() {
    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const now = performance.now();
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 1 / 30;
    if (lastFrame) fps = fps * 0.9 + (1000 / (now - lastFrame)) * 0.1;
    lastFrame = now;
    const t = now / 1000;

    const t0 = performance.now();
    const result = recognizer.recognizeForVideo(video, now);
    const inferMs = performance.now() - t0;
    const hands = tracker.update(result, w, h, dt, now);
    const f = { video, w, h, t, dt, now, hands };
    const labels = [];

    // Mirrored world layer: everything uses raw image coordinates.
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    drawBackground(ctx, video, w, h, mode?.grade);
    if (mode && !switching) {
        mode.update(f);
        mode.draw(ctx, f, labels);
    }
    drawHands(ctx, hands, t, labels);
    handleShiftGesture(hands, labels);
    drawLabels(ctx, labels, w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (now - lastHud > 120) {
        lastHud = now;
        const p = (now - titleAt) / 900;
        hudTitle.textContent = decode(MODES[modeIndex]?.name.toUpperCase() || "", p);
        hudGlyph.textContent = toGlyphs(MODES[modeIndex]?.name || "");
        hudStats.textContent = [
            `fps      ${fps.toFixed(0)}`,
            `neural   ${inferMs.toFixed(1)} ms · ${delegate}`,
            `hands    ${hands.length ? hands.map((hd) => `${hd.side[0]}:${hd.gesture === "None" ? "·" : hd.gesture}`).join("  ") : "none"}`,
            ...(mode?.status() || []),
        ].join("\n");
    }
}

// 🤟 "I love you" held = the alien salute: shift to the next dimension (mode).
function handleShiftGesture(hands, labels) {
    for (const hd of hands) {
        if (hd.gesture !== "ILoveYou") continue;
        const k = Math.min(1, hd.gestureMs / SHIFT_HOLD_MS);
        const c = hd.P(9);
        ctx.save();
        ctx.strokeStyle = ctx.shadowColor = "#00ffd0";
        ctx.shadowBlur = 16;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c.x, c.y, hd.size * 1.3, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        labels.push({ x: c.x, y: c.y - hd.size * 1.6, align: "center", color: "#00ffd0", text: "SHIFTING DIMENSION" });
        if (tracker.once(hd, "ILoveYou", SHIFT_HOLD_MS)) switchMode((modeIndex + 1) % MODES.length);
    }
}
