// PORTAL — frame a window with both thumbs and index fingers; inside it you see through alien eyes.
// A WebGL pass renders the whole camera frame through the current "lens"; the 2D layer clips it
// to the quad spanned by the four fingertips.

import { OneEuroFilter } from "../core/one-euro.js";
import { glyphAt } from "../core/glyphs.js";

const LENSES = ["THERMAL", "XENO X-RAY", "CLOAK", "VOID"];

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform int u_mode;
varying vec2 v_uv;

float lum(vec2 uv) { return dot(texture2D(u_tex, uv).rgb, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float sobel(vec2 uv) {
    vec2 px = 1.0 / u_res;
    float tl = lum(uv + px * vec2(-1, -1)), t = lum(uv + px * vec2(0, -1)), tr = lum(uv + px * vec2(1, -1));
    float l = lum(uv + px * vec2(-1, 0)), r = lum(uv + px * vec2(1, 0));
    float bl = lum(uv + px * vec2(-1, 1)), b = lum(uv + px * vec2(0, 1)), br = lum(uv + px * vec2(1, 1));
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    return length(vec2(gx, gy));
}
// Iron-bow thermal palette.
vec3 thermal(float x) {
    vec3 c = mix(vec3(0.0, 0.0, 0.1), vec3(0.35, 0.0, 0.6), smoothstep(0.0, 0.25, x));
    c = mix(c, vec3(0.9, 0.05, 0.2), smoothstep(0.2, 0.45, x));
    c = mix(c, vec3(1.0, 0.55, 0.0), smoothstep(0.45, 0.7, x));
    c = mix(c, vec3(1.0, 1.0, 0.7), smoothstep(0.7, 0.95, x));
    return c;
}

void main() {
    vec2 uv = v_uv;
    vec3 col;
    if (u_mode == 0) {
        float v = lum(uv);
        col = thermal(pow(v, 0.9) + 0.04 * sin(u_time * 2.0 + uv.y * 40.0));
    } else if (u_mode == 1) {
        float e = sobel(uv);
        float inv = 1.0 - lum(uv);
        col = vec3(0.1, 1.0, 0.75) * smoothstep(0.08, 0.5, e) * 1.6 + vec3(0.05, 0.12, 0.2) * inv;
        col += vec3(0.0, 0.25, 0.2) * step(0.98, fract(uv.y * 90.0 - u_time * 4.0));
    } else if (u_mode == 2) {
        vec2 d = vec2(fbm(uv * 8.0 + u_time * 0.6), fbm(uv * 8.0 - u_time * 0.5)) - 0.5;
        vec2 w = uv + d * 0.035;
        col = vec3(texture2D(u_tex, w + vec2(0.004, 0.0)).r, texture2D(u_tex, w).g, texture2D(u_tex, w - vec2(0.004, 0.0)).b);
        vec2 hex = uv * u_res / 22.0;
        float grid = step(0.92, max(fract(hex.x + hex.y * 0.5), fract(hex.y)));
        col = mix(col, col * vec3(0.5, 1.2, 1.1), 0.5) + vec3(0.0, 0.3, 0.25) * grid * 0.4;
    } else {
        float n = fbm(uv * 3.0 + vec2(u_time * 0.05, 0.0));
        vec3 neb = mix(vec3(0.02, 0.0, 0.08), vec3(0.45, 0.05, 0.6), n);
        neb = mix(neb, vec3(0.0, 0.6, 0.7), smoothstep(0.55, 0.8, fbm(uv * 6.0 - u_time * 0.03)));
        float stars = step(0.997, hash(floor(uv * u_res / 2.0)));
        float e = smoothstep(0.1, 0.45, sobel(uv));
        col = neb + stars + vec3(0.7, 1.0, 1.0) * e;
    }
    gl_FragColor = vec4(col, 1.0);
}`;

export default class Portal {
    constructor(env) {
        this.env = env;
        this.title = "Portal";
        this.hint = "Frame a window with both thumbs + index fingers  ·  👍 with one hand = next lens  ·  [L] next lens";
        this.grade = { saturation: 0.6, dim: 0.25, tint: null, vignette: 0.6 };
        this.lens = 0;
        this.open = 0;
        this.quad = null;
        this.filters = Array.from({ length: 8 }, () => new OneEuroFilter(1.2, 0.02));
        this.canvas = document.createElement("canvas");
        this.initGL();
    }

    initGL() {
        const gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true });
        if (!gl) { this.gl = null; return; }
        this.gl = gl;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "a_pos");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
            [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        this.u = Object.fromEntries(["res", "time", "mode"].map((n) => [n, gl.getUniformLocation(prog, `u_${n}`)]));
    }

    activate() {}
    deactivate() {}

    onKey(k) {
        if (k === "l") this.nextLens();
    }

    nextLens() {
        this.lens = (this.lens + 1) % LENSES.length;
        this.env.toast(`Lens: ${LENSES[this.lens]}`);
    }

    update({ hands, now, t }) {
        if (hands.length === 1 && this.env.tracker.once(hands[0], "Thumb_Up", 300)) this.nextLens();

        let pts = null;
        if (hands.length >= 2) {
            // Order the hands by screen side so the quad never self-intersects:
            // left index -> right index -> right thumb -> left thumb.
            const [a, b] = [...hands].sort((p, q) => q.palm.x - p.palm.x);
            pts = [a.P(8), b.P(8), b.P(4), a.P(4)];
        }
        if (pts) {
            this.quad = pts.map((p, i) => ({ x: this.filters[i * 2].filter(p.x, t), y: this.filters[i * 2 + 1].filter(p.y, t) }));
            const area = Math.abs(this.quad.reduce((s, p, i) => {
                const q = this.quad[(i + 1) % 4];
                return s + p.x * q.y - q.x * p.y;
            }, 0)) / 2;
            this.area = area;
            // Ignore near-closed frames so a tiny sliver doesn't flicker over your face.
            this.open += ((area > 9000 ? 1 : 0) - this.open) * 0.2;
        } else {
            this.open += (0 - this.open) * 0.2;
            if (this.open < 0.02) { this.quad = null; this.filters.forEach((f) => f.reset()); }
        }
    }

    draw(ctx, { video, w, h, t }, labels) {
        if (!this.quad || this.open < 0.02) return;
        const q = this.quad;
        // Scale the quad from its centre while opening/closing.
        const c = q.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
        const k = this.open;
        const pts = q.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));

        if (this.gl) {
            const gl = this.gl;
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w; this.canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.uniform2f(this.u.res, w, h);
            gl.uniform1f(this.u.time, t);
            gl.uniform1i(this.u.mode, this.lens);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        const path = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
        };
        ctx.save();
        path();
        ctx.clip();
        if (this.gl) ctx.drawImage(this.canvas, 0, 0, w, h);
        ctx.restore();

        // Energy membrane border, corner nodes, glyph ticks along the edges.
        ctx.save();
        ctx.lineJoin = "round";
        for (const [width, alpha, blur] of [[10, 0.25, 24], [2.5, 1, 6]]) {
            ctx.strokeStyle = ctx.shadowColor = `rgba(0, 255, 208, ${alpha})`;
            ctx.shadowBlur = blur;
            ctx.lineWidth = width * (1 + 0.15 * Math.sin(t * 8));
            path();
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "rgba(0,255,208,0.9)";
        ctx.font = "14px 'Space Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let e = 0; e < 4; e++) {
            const a = pts[e], b = pts[(e + 1) % 4];
            for (let s = 1; s < 6; s++) {
                const x = a.x + (b.x - a.x) * s / 6, y = a.y + (b.y - a.y) * s / 6;
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(-1, 1);   // un-mirror the glyphs
                ctx.fillText(glyphAt(e * 7 + s + Math.floor(t * 4)), 0, 0);
                ctx.restore();
            }
        }
        ctx.restore();

        const top = pts.reduce((m, p) => (p.y < m.y ? p : m));
        labels.push({ x: c.x, y: top.y - 26, align: "center", color: "#00ffd0",
            text: `◈ LENS ${this.lens + 1}/${LENSES.length} · ${LENSES[this.lens]}` });
    }

    status() {
        return [
            `lens     ${LENSES[this.lens]}`,
            `portal   ${this.open > 0.5 ? `open · ${Math.round(this.area || 0)} px²` : "closed"}`,
        ];
    }
}
