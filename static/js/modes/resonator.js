// RESONATOR — an alien instrument played with your hands.
//  Right hand height -> pitch, quantised to the Bohlen–Pierce scale (13 steps per 3:1 "tritave"
//  instead of 12 per octave: a real tuning system that sounds unmistakably non-human).
//  Right hand x -> filter brightness. Left thumb–index spread -> volume.
//  Left extended-finger count (0–5) -> drum pattern density. Right fist -> silence.

import { glyphAt } from "../core/glyphs.js";

const BP_STEP = Math.pow(3, 1 / 13);
const BASE_HZ = 98;
const STEPS = 26;          // two tritaves
const BPM = 112;

// 16-step drum patterns by density level (index = left-hand finger count).
const PATTERNS = [
    {},
    { kick: [0, 8] },
    { kick: [0, 6, 8], snare: [4, 12] },
    { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 6, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], zap: [3, 7, 15] },
    { kick: [0, 3, 6, 8, 11], snare: [4, 12, 14], hat: [...Array(16).keys()], zap: [3, 7, 10, 15] },
];
const DRUM_COLORS = { kick: "#ff5470", snare: "#ffd166", hat: "#7cffb2", zap: "#b18cff" };

export default class Resonator {
    constructor(env) {
        this.env = env;
        this.title = "Resonator";
        this.hint = "Right hand ↕ pitch · ↔ tone  ·  left pinch spread = volume  ·  left fingers = drums  ·  right fist = silence";
        this.grade = { saturation: 0, dim: 0.15, tint: "rgba(0, 255, 200, 0.25)", vignette: 0.6 };
        this.level = 0;
        this.step = 0;
        this.freq = BASE_HZ;
        this.noteStep = 0;
        this.volume = 0;
        this.cutoff = 1200;
        this.stepHits = new Array(16).fill(null);
        this.build();
    }

    build() {
        const ac = this.env.audio;
        this.out = ac.createGain();
        this.out.gain.value = 0;
        const comp = ac.createDynamicsCompressor();
        this.analyser = ac.createAnalyser();
        this.analyser.fftSize = 2048;
        this.wave = new Float32Array(this.analyser.fftSize);
        this.out.connect(comp).connect(this.analyser).connect(ac.destination);

        // Voice: detuned saw + square + sub sine -> resonant lowpass -> VCA -> echo.
        this.filter = ac.createBiquadFilter();
        this.filter.type = "lowpass";
        this.filter.Q.value = 9;
        this.vca = ac.createGain();
        this.vca.gain.value = 0;
        const oscs = [["sawtooth", 0], ["square", 6], ["sine", -1200]].map(([type, detune]) => {
            const o = ac.createOscillator();
            o.type = type;
            o.detune.value = detune;
            const g = ac.createGain();
            g.gain.value = type === "sine" ? 0.5 : 0.22;
            o.connect(g).connect(this.filter);
            o.start();
            return o;
        });
        this.oscs = oscs;
        // Slow alien vibrato.
        const lfo = ac.createOscillator();
        lfo.frequency.value = 5.2;
        const lfoAmt = ac.createGain();
        lfoAmt.gain.value = 14;
        lfo.connect(lfoAmt);
        oscs.forEach((o) => lfoAmt.connect(o.detune));
        lfo.start();

        const delay = ac.createDelay(1);
        delay.delayTime.value = 60 / BPM * 0.75;
        const fb = ac.createGain();
        fb.gain.value = 0.38;
        const damp = ac.createBiquadFilter();
        damp.type = "lowpass";
        damp.frequency.value = 2500;
        this.filter.connect(this.vca);
        this.vca.connect(this.out);
        this.vca.connect(delay).connect(damp).connect(fb).connect(delay);
        damp.connect(this.out);

        this.drumBus = ac.createGain();
        this.drumBus.gain.value = 0.9;
        this.drumBus.connect(this.out);
        const len = ac.sampleRate;
        this.noise = ac.createBuffer(1, len, ac.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    activate() {
        const ac = this.env.audio;
        ac.resume();
        this.out.gain.setTargetAtTime(0.9, ac.currentTime, 0.1);
        this.nextStepTime = ac.currentTime + 0.05;
        this.timer = setInterval(() => this.schedule(), 25);
    }

    deactivate() {
        const ac = this.env.audio;
        clearInterval(this.timer);
        this.out.gain.setTargetAtTime(0, ac.currentTime, 0.05);
        this.vca.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    }

    // Look-ahead scheduler: queue drum hits slightly ahead on the audio clock for tight timing.
    schedule() {
        const ac = this.env.audio;
        const stepDur = 60 / BPM / 4;
        while (this.nextStepTime < ac.currentTime + 0.12) {
            const pattern = PATTERNS[this.level];
            const hits = Object.keys(pattern).filter((d) => pattern[d].includes(this.step));
            hits.forEach((d) => this[d](this.nextStepTime));
            this.stepHits[this.step] = hits.length ? hits : null;
            const s = this.step;
            setTimeout(() => { this.playhead = s; }, Math.max(0, (this.nextStepTime - ac.currentTime) * 1000));
            this.step = (this.step + 1) % 16;
            this.nextStepTime += stepDur;
        }
    }

    env_(g, t, peak, decay) {
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    }

    kick(t) {
        const ac = this.env.audio, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.setValueAtTime(160, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
        this.env_(g, t, 1, 0.35);
        o.connect(g).connect(this.drumBus);
        o.start(t); o.stop(t + 0.4);
    }

    noiseHit(t, type, freq, peak, decay) {
        const ac = this.env.audio, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = this.noise;
        f.type = type; f.frequency.value = freq;
        this.env_(g, t, peak, decay);
        src.connect(f).connect(g).connect(this.drumBus);
        src.start(t, Math.random() * 0.5); src.stop(t + decay + 0.05);
    }

    snare(t) {
        this.noiseHit(t, "bandpass", 1900, 0.7, 0.18);
        const ac = this.env.audio, o = ac.createOscillator(), g = ac.createGain();
        o.type = "triangle"; o.frequency.value = 190;
        this.env_(g, t, 0.4, 0.1);
        o.connect(g).connect(this.drumBus);
        o.start(t); o.stop(t + 0.15);
    }

    hat(t) { this.noiseHit(t, "highpass", 8000, 0.25, 0.05); }

    // Alien "zap": a falling FM blip.
    zap(t) {
        const ac = this.env.audio, o = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(1400, t);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
        m.frequency.value = 57; mg.gain.value = 300;
        m.connect(mg).connect(o.frequency);
        this.env_(g, t, 0.18, 0.16);
        o.connect(g).connect(this.drumBus);
        o.start(t); m.start(t); o.stop(t + 0.2); m.stop(t + 0.2);
    }

    update({ hands, w, h }) {
        const ac = this.env.audio, now = ac.currentTime;
        const right = hands.find((hd) => hd.side.startsWith("Right")) || (hands.length === 1 ? hands[0] : null);
        const left = hands.find((hd) => hd.side.startsWith("Left") && hd !== right);
        this.right = right;
        this.left = left;

        if (right && right.gesture !== "Closed_Fist") {
            const tip = right.P(8);
            this.noteStep = Math.round((1 - Math.min(1, Math.max(0, tip.y / h))) * STEPS);
            this.freq = BASE_HZ * Math.pow(BP_STEP, this.noteStep);
            // Mirrored view: raw x=0 is screen right, so invert for "right = brighter".
            this.cutoff = 250 * Math.pow(32, 1 - tip.x / w);
            this.oscs.forEach((o) => o.frequency.setTargetAtTime(this.freq, now, 0.035));
            this.filter.frequency.setTargetAtTime(this.cutoff, now, 0.05);
            this.volume = left ? Math.min(1, Math.max(0, (left.pinchRatio - 0.2) / 1.0)) : 0.6;
        } else {
            this.volume = 0;
        }
        this.vca.gain.setTargetAtTime(this.volume * 0.5, now, 0.04);
        this.level = left ? left.fingerCount : 0;
    }

    draw(ctx, { w, h, t }, labels) {
        this.analyser.getFloatTimeDomainData(this.wave);

        // Waveform ribbon across the lower third.
        const y0 = h * 0.74, amp = h * 0.16;
        ctx.save();
        ctx.lineJoin = "round";
        for (const [width, color, blur] of [[8, "rgba(0,255,200,0.25)", 20], [2.5, "rgba(124,255,178,1)", 6]]) {
            ctx.strokeStyle = ctx.shadowColor = color;
            ctx.shadowBlur = blur;
            ctx.lineWidth = width;
            ctx.beginPath();
            const n = 512;
            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * w, y = y0 + this.wave[i * 2] * amp;
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
        }
        ctx.restore();

        // Resonance string between the two index fingertips: a standing wave whose node count
        // tracks the note and whose amplitude tracks volume.
        if (this.right && this.left && this.volume > 0.01) {
            const a = this.left.P(8), b = this.right.P(8);
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
            const k = 2 + (this.noteStep % 13) / 2;
            ctx.save();
            ctx.strokeStyle = ctx.shadowColor = "rgba(177,140,255,0.95)";
            ctx.shadowBlur = 14;
            ctx.lineWidth = 2;
            for (const phase of [0, Math.PI]) {
                ctx.beginPath();
                for (let i = 0; i <= 80; i++) {
                    const s = i / 80;
                    const off = Math.sin(s * Math.PI * k) * Math.sin(t * 18 + phase) * this.volume * 26;
                    const x = a.x + (b.x - a.x) * s + nx * off, y = a.y + (b.y - a.y) * s + ny * off;
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // Step sequencer, drawn un-mirrored so it runs left -> right on screen.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const cell = Math.min(34, w / 26), gap = cell * 0.35, total = 16 * cell + 15 * gap;
        const sx = (w - total) / 2, sy = h * 0.9;
        for (let i = 0; i < 16; i++) {
            const hits = this.stepHits[i];
            const x = sx + i * (cell + gap);
            ctx.fillStyle = hits ? DRUM_COLORS[hits[0]] : "rgba(255,255,255,0.18)";
            ctx.globalAlpha = i === this.playhead ? 1 : hits ? 0.55 : 0.4;
            ctx.fillRect(x, sy, cell, cell);
            if (i === this.playhead) {
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 3, sy - 3, cell + 6, cell + 6);
            }
        }
        ctx.restore();

        // Readouts next to the hands.
        if (this.right) {
            const p = this.right.P(8);
            labels.push({ x: p.x - 30, y: p.y - 30, color: "#b18cff",
                text: `PITCH ${glyphAt(this.noteStep)} ${this.noteStep % 13}/13 · ${this.freq.toFixed(0)} Hz` });
        }
        if (this.left) {
            const p = this.left.P(8);
            const drums = Object.keys(PATTERNS[this.level]);
            labels.push({ x: p.x + 40, y: p.y - 40, color: "#7cffb2", text: `VOLUME ${this.volume.toFixed(2)}` });
            labels.push({ x: p.x + 40, y: p.y - 4, color: "#ffd166", text: `DRUMS: ${drums.length ? drums.join(", ") : "none"}` });
        }
    }

    status() {
        return [
            `scale    Bohlen–Pierce (3^(1/13))`,
            `note     ${this.noteStep % 13}/13 · ${this.freq.toFixed(0)} Hz`,
            `volume   ${this.volume.toFixed(2)}`,
            `drums    level ${this.level}/5 · ${BPM} bpm`,
        ];
    }
}
