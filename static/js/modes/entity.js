// ENTITY — a procedural alien jellyfish that lives in your camera.
//  Its eye tracks your index finger. Open palm = it gets curious and drifts over, tentacles reaching.
//  Fist nearby = it recoils in fear. Pinch to DRAG / ROTATE / SCALE it (pick the tool with the
//  buttons, keys, or your voice); pinch with both hands to scale + roll it.
//  Voice commands: drag · rotate · scale · reset · colour · spin · dance · come here · sleep · wake · hello

import * as THREE from "three";
import { Scene3D, fresnelMaterial } from "../core/scene3d.js";

const TENTACLES = 9, BEADS = 18;
const MOODS = {
    calm: 0x00ffd0, curious: 0x7cffb2, afraid: 0xff4d6d, excited: 0xffd166, asleep: 0x3a5fff,
};

export default class Entity {
    constructor(env) {
        this.env = env;
        this.title = "Entity";
        this.hint = "🖐 open palm = it comes to you · ✊ fist = it flees · 🤏 pinch = drag / rotate / scale · 🤏🤏 = scale + roll · 🎙 voice commands";
        this.grade = { saturation: 0.4, dim: 0.3, tint: "rgba(0, 120, 255, 0.25)", vignette: 0.75 };
        this.s3 = new Scene3D();
        this.tool = "drag";
        this.state = { pos: null, S: 0, yaw: 0, pitch: 0, roll: 0 };
        this.mood = "calm";
        this.hueShift = 0;
        this.grab = null;
        this.dual = null;
        this.eyeOpen = 1;
        this.eyeTarget = 1;
        this.nextBlink = 2;
        this.spinUntil = 0;
        this.danceUntil = 0;
        this.comeUntil = 0;
        this.voiceOn = false;
        this.build();
    }

    build() {
        const g = this.body = new THREE.Group();
        const dome = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.56), mat);
        this.bellGlow = fresnelMaterial(MOODS.calm, 1.6, 1.1);
        this.bell = dome(1, this.bellGlow);
        this.bellSkin = dome(0.96, new THREE.MeshPhysicalMaterial({
            color: 0x9ffff0, transparent: true, opacity: 0.12, roughness: 0.1, iridescence: 1, side: THREE.FrontSide, depthWrite: false,
        }));
        this.coreMat = new THREE.MeshBasicMaterial({ color: MOODS.calm, toneMapped: false });
        // Glowing core sits high in the bell, behind the eye, wrapped in a soft halo.
        this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 3), this.coreMat);
        this.core.position.set(0, 0.62, -0.1);
        this.coreHalo = fresnelMaterial(MOODS.calm, 1.2, 1.4);
        this.core.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), this.coreHalo));   // radius in body units
        this.light = new THREE.PointLight(MOODS.calm, 1.5, 0, 0);
        this.light.position.set(0, 0.3, 1.5);

        // Eye: sclera, iris, pupil, glint — lookAt() aims +z at the target.
        this.eye = new THREE.Group();
        this.eye.position.set(0, 0.28, 0.72);
        const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), new THREE.MeshStandardMaterial({ color: 0xe9fff9, roughness: 0.3 }));
        this.irisMat = new THREE.MeshBasicMaterial({ color: MOODS.calm, toneMapped: false });
        const iris = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), this.irisMat);
        iris.position.z = 0.285;
        this.pupil = new THREE.Mesh(new THREE.CircleGeometry(0.085, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        this.pupil.position.z = 0.29;
        const glint = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
        glint.position.set(0.05, 0.06, 0.295);
        this.eye.add(sclera, iris, this.pupil, glint);

        // Tentacles: bead chains (one instanced mesh), coloured from the mood colour to white.
        this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), TENTACLES * BEADS);
        this.beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const n = 200, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(1.3 + Math.random() * 1.2);
            pos.set([v.x, v.y - 0.6, v.z], i * 3);
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        this.motes = new THREE.Points(pg, new THREE.PointsMaterial({
            color: 0x9ffff0, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
        }));

        g.add(this.bellSkin, this.bell, this.core, this.light, this.eye, this.beads, this.motes);
        this.s3.scene.add(g);
    }

    // ------------------------------------------------------------------ UI + voice

    activate() {
        const ui = this.env.ui;
        ui.innerHTML = `
            <div class="tool-panel">
                ${["drag", "rotate", "scale"].map((t) => `<button data-tool="${t}">${t.toUpperCase()}</button>`).join("")}
                <button data-voice>🎙 VOICE</button>
            </div>
            <div class="transcript" hidden></div>`;
        ui.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => this.setTool(b.dataset.tool)));
        ui.querySelector("[data-voice]").addEventListener("click", () => this.toggleVoice());
        this.setTool(this.tool);
    }

    deactivate() {
        this.stopVoice();
    }

    onKey(k) {
        if (k === "g") this.setTool("drag");
        else if (k === "r") this.setTool("rotate");
        else if (k === "s") this.setTool("scale");
        else if (k === "v") this.toggleVoice();
    }

    setTool(tool) {
        this.tool = tool;
        this.env.ui.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    }

    say(text) {
        const el = this.env.ui.querySelector(".transcript");
        if (!el) return;
        el.textContent = text;
        el.hidden = false;
        clearTimeout(this.sayTimer);
        this.sayTimer = setTimeout(() => (el.hidden = true), 3500);
    }

    toggleVoice() {
        if (this.voiceOn) { this.stopVoice(); return; }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { this.env.toast("Voice commands need Chrome, Edge or Safari"); return; }
        const rec = this.rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = "en-US";
        rec.onresult = (e) => {
            const text = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
            this.command(text);
        };
        rec.onerror = (e) => { if (e.error === "not-allowed") { this.env.toast("Microphone blocked"); this.stopVoice(); } };
        rec.onend = () => { if (this.voiceOn) try { rec.start(); } catch { /* already running */ } };
        try { rec.start(); } catch { /* already running */ }
        this.voiceOn = true;
        this.env.ui.querySelector("[data-voice]")?.classList.add("active");
        this.say("🎙 listening… try “rotate”, “spin”, “come here”");
    }

    stopVoice() {
        this.voiceOn = false;
        try { this.rec?.stop(); } catch { /* not running */ }
        this.env.ui.querySelector("[data-voice]")?.classList.remove("active");
    }

    command(text) {
        const now = performance.now() / 1000;
        const has = (...words) => words.some((w) => text.includes(w));
        let reply = null;
        if (has("drag", "move")) { this.setTool("drag"); reply = "tool: drag"; }
        else if (has("rotate", "turn")) { this.setTool("rotate"); reply = "tool: rotate"; }
        else if (has("scale", "size", "resize")) { this.setTool("scale"); reply = "tool: scale"; }
        else if (has("reset", "home")) { this.state.pos = null; reply = "resetting"; }
        else if (has("colour", "color")) { this.hueShift = (this.hueShift + 0.17) % 1; reply = "shifting spectrum"; }
        else if (has("spin")) { this.spinUntil = now + 1.6; reply = "spinning"; }
        else if (has("dance", "party")) { this.danceUntil = now + 4; reply = "dancing"; }
        else if (has("come", "here")) { this.comeUntil = now + 4; reply = "approaching"; }
        else if (has("sleep", "night")) { this.eyeTarget = 0; reply = "entering stasis"; }
        else if (has("wake", "up")) { this.eyeTarget = 1; reply = "awake"; }
        else if (has("hello", "hi ", "hey")) { this.danceUntil = now + 1.5; reply = "greetings, human"; }
        this.say(reply ? `“${text}” → ${reply}` : `“${text}”`);
        if (reply) this.chirp();
    }

    // Alien reply: a few gliding FM blips.
    chirp() {
        const ac = this.env.audio;
        ac.resume();
        let t = ac.currentTime;
        for (let i = 0; i < 3 + ((Math.random() * 3) | 0); i++) {
            const o = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
            const f = 500 + Math.random() * 900;
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.8 : 0.55), t + 0.09);
            m.frequency.value = f * 1.5; mg.gain.value = f * 0.6;
            m.connect(mg).connect(o.frequency);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
            o.connect(g).connect(ac.destination);
            o.start(t); m.start(t); o.stop(t + 0.12); m.stop(t + 0.12);
            t += 0.07 + Math.random() * 0.05;
        }
    }

    // ------------------------------------------------------------------ behaviour

    update({ hands, w, h, dt, t }) {
        this.s3.resize(w, h);
        const st = this.state;
        if (!st.pos) { st.pos = { x: w / 2, y: h * 0.42 }; st.S = Math.min(w, h) * 0.13; st.yaw = st.pitch = st.roll = 0; }
        const bySide = new Map(hands.map((hd) => [hd.side, hd]));
        const pinching = hands.filter((hd) => hd.pinch);

        // --- manipulation
        if (pinching.length >= 2) {
            const [a, b] = pinching;
            const dist = Math.hypot(a.pinch.x - b.pinch.x, a.pinch.y - b.pinch.y) || 1;
            const ang = Math.atan2(b.pinch.y - a.pinch.y, b.pinch.x - a.pinch.x);
            if (!this.dual) this.dual = { dist, ang, S: st.S, roll: st.roll };
            st.S = Math.max(40, Math.min(Math.min(w, h) * 0.5, this.dual.S * dist / this.dual.dist));
            st.roll = this.dual.roll + (ang - this.dual.ang);
            this.grab = null;
        } else {
            this.dual = null;
            const hd = pinching[0];
            if (hd && !this.grab) {
                const near = Math.hypot(hd.pinch.x - st.pos.x, hd.pinch.y - st.pos.y) < st.S * 2.2;
                if (this.tool !== "drag" || near) {
                    this.grab = { side: hd.side, p0: { ...hd.pinch }, pos: { ...st.pos }, yaw: st.yaw, pitch: st.pitch, S: st.S };
                }
            }
            if (this.grab) {
                const g = bySide.get(this.grab.side);
                if (!g?.pinch) this.grab = null;
                else {
                    const dx = g.pinch.x - this.grab.p0.x, dy = g.pinch.y - this.grab.p0.y;
                    if (this.tool === "drag") st.pos = { x: this.grab.pos.x + dx, y: this.grab.pos.y + dy };
                    else if (this.tool === "rotate") { st.yaw = this.grab.yaw - dx * 0.012; st.pitch = this.grab.pitch + dy * 0.012; }
                    else st.S = Math.max(40, Math.min(Math.min(w, h) * 0.5, this.grab.S * Math.exp(-dy * 0.005)));
                }
            }
        }
        const held = !!(this.grab || this.dual);

        // --- mood + autonomous motion
        const fist = hands.find((hd) => hd.gesture === "Closed_Fist" && Math.hypot(hd.palm.x - st.pos.x, hd.palm.y - st.pos.y) < st.S * 5);
        const palm = hands.find((hd) => hd.gesture === "Open_Palm" && !hd.pinch);
        const come = t < this.comeUntil ? hands[0] : null;
        let target = null;
        if (this.eyeTarget === 0) this.mood = "asleep";
        else if (fist) this.mood = "afraid";
        else if (held) this.mood = "excited";
        else if (palm || come) this.mood = "curious";
        else this.mood = "calm";

        if (!held) {
            if (this.mood === "afraid") {
                const dx = st.pos.x - fist.palm.x, dy = st.pos.y - fist.palm.y, d = Math.hypot(dx, dy) || 1;
                st.pos.x += (dx / d) * 500 * dt;
                st.pos.y += (dy / d) * 500 * dt;
            } else if (this.mood === "curious") {
                const hd = palm || come;
                target = { x: hd.palm.x, y: hd.palm.y - hd.size * 1.6 - st.S * 0.4 };
                st.pos.x += (target.x - st.pos.x) * Math.min(1, dt * 1.8);
                st.pos.y += (target.y - st.pos.y) * Math.min(1, dt * 1.8);
            }
            const m = st.S;
            st.pos.x = Math.min(w - m, Math.max(m, st.pos.x));
            st.pos.y = Math.min(h - m, Math.max(m, st.pos.y));
        }
        this.reach = this.mood === "curious" ? (palm || come) : null;

        // --- eye: blink, sleep, look at the nearest index fingertip
        if (t > this.nextBlink) { this.blinkAt = t; this.nextBlink = t + 2.5 + Math.random() * 3; }
        const blink = this.blinkAt && t - this.blinkAt < 0.14 ? 0.1 : 1;
        this.eyeOpen += (this.eyeTarget * blink - this.eyeOpen) * Math.min(1, dt * 18);
        const tip = hands.length ? hands.map((hd) => hd.P(8)).sort((a, b) =>
            Math.hypot(a.x - st.pos.x, a.y - st.pos.y) - Math.hypot(b.x - st.pos.x, b.y - st.pos.y))[0] : null;
        this.lookAt = tip;

        this.t = t;
        this.apply(t, dt);
    }

    apply(t, dt) {
        const st = this.state;
        const color = new THREE.Color(MOODS[this.mood]).offsetHSL(this.hueShift, 0, 0);
        this.coreMat.color.lerp(color, 0.1);
        this.irisMat.color.lerp(color, 0.1);
        this.bellGlow.uniforms.uColor.value.lerp(color, 0.1);
        this.bellGlow.uniforms.uTime.value = t;
        this.coreHalo.uniforms.uColor.value.copy(this.coreMat.color);
        this.coreHalo.uniforms.uTime.value = t;
        this.light.color.lerp(color, 0.1);

        const dancing = t < this.danceUntil;
        const pulseRate = { calm: 2.2, curious: 3, afraid: 7, excited: 5, asleep: 1 }[this.mood] * (dancing ? 2 : 1);
        const pulse = Math.sin(t * pulseRate);
        const scaleMood = this.mood === "afraid" ? 0.85 : 1;
        const g = this.body;
        g.position.set(st.pos.x, -st.pos.y + Math.sin(t * 1.4) * st.S * (dancing ? 0.25 : 0.06), 0);
        g.scale.setScalar(st.S * scaleMood);
        const spin = t < this.spinUntil ? (this.spinUntil - t) * 9 : 0;
        this.spinAngle = (this.spinAngle || 0) + spin * dt;
        if (!spin) {
            // Settle back to facing forward after a spin.
            const rest = Math.round(this.spinAngle / (Math.PI * 2)) * Math.PI * 2;
            this.spinAngle += (rest - this.spinAngle) * Math.min(1, dt * 4);
        }
        g.rotation.set(st.pitch + (dancing ? Math.sin(t * 6) * 0.25 : 0), st.yaw + this.spinAngle, -st.roll + (dancing ? Math.sin(t * 4) * 0.3 : 0));
        this.bell.scale.set(1 + pulse * 0.06, 1 - pulse * 0.09, 1 + pulse * 0.06);
        this.bellSkin.scale.copy(this.bell.scale);
        this.core.scale.setScalar(1 + 0.2 * Math.max(0, pulse));
        this.motes.rotation.y += dt * 0.3;

        // Eye tracking (world-space target in front of the screen) + lids.
        if (this.lookAt) this.eye.lookAt(new THREE.Vector3(this.lookAt.x, -this.lookAt.y, 900));
        else this.eye.rotation.set(0, 0, 0);
        this.eye.scale.set(1, Math.max(0.08, this.eyeOpen), 1);
        this.pupil.scale.setScalar(this.mood === "afraid" ? 0.55 : this.mood === "curious" ? 1.35 : 1);

        // Tentacles: bead chains swaying down from the rim; bend toward an open palm when curious.
        const reachLocal = this.reach ? g.worldToLocal(new THREE.Vector3(this.reach.palm.x, -this.reach.palm.y, 0)) : null;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const c = new THREE.Color();
        const baseCol = this.coreMat.color;
        const wave = dancing ? 3 : 1.2;
        for (let k = 0; k < TENTACLES; k++) {
            const a = (k / TENTACLES) * Math.PI * 2;
            p.set(Math.cos(a) * 0.82, -0.02, Math.sin(a) * 0.82);
            const dir = new THREE.Vector3(Math.cos(a) * 0.25, -1, Math.sin(a) * 0.25).normalize();
            for (let i = 0; i < BEADS; i++) {
                const f = i / BEADS;
                const sway = new THREE.Vector3(Math.sin(t * wave + i * 0.45 + k) * 0.35 * f, 0, Math.cos(t * wave * 0.8 + i * 0.4 + k * 1.7) * 0.35 * f);
                const d = dir.clone().add(sway);
                if (reachLocal) d.lerp(reachLocal.clone().sub(p).normalize(), f * 0.85);
                if (this.mood === "afraid") d.lerp(new THREE.Vector3(0, 0.6, 0), f * 0.5);   // curl up
                p.add(d.normalize().multiplyScalar(0.13 * (1 - f * 0.35)));
                s.setScalar(0.05 * (1 - f * 0.7));
                m.compose(p, q, s);
                this.beads.setMatrixAt(k * BEADS + i, m);
                this.beads.setColorAt(k * BEADS + i, c.copy(baseCol).lerp(new THREE.Color(0xffffff), f * 0.6 + 0.15 * Math.sin(t * 6 - i * 0.6)));
            }
        }
        this.beads.instanceMatrix.needsUpdate = true;
        this.beads.instanceColor.needsUpdate = true;
    }

    draw(ctx, { w, h }, labels) {
        this.s3.render(ctx);
        const st = this.state;
        labels.push({ x: st.pos.x, y: st.pos.y - st.S * 1.35, align: "center", color: `#${this.coreMat.color.getHexString()}`,
            text: `ENTITY-7 · ${this.mood.toUpperCase()}` });
        if (this.grab || this.dual) {
            labels.push({ x: st.pos.x, y: st.pos.y + st.S * 2.1, align: "center", color: "#ffffff", plain: true,
                text: this.dual ? `SCALE ×${(st.S / (Math.min(w, h) * 0.13)).toFixed(2)} · ROLL ${(st.roll * 57.3).toFixed(0)}°` : `${this.tool.toUpperCase()}` });
        }
    }

    status() {
        return [
            `mood     ${this.mood}`,
            `tool     ${this.tool}  (G/R/S)`,
            `voice    ${this.voiceOn ? "listening" : "off  (V)"}`,
        ];
    }
}
