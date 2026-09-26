// ARTIFACTS — alien relics floating in zero gravity.
//  Pinch to grab and drag (hand twist rotates it) · release to fling it drifting.
//  Pinch the same artifact with both hands to scale + rotate it.
//  Hold an open palm to open a rift and summon the next artifact.
//  Throw an artifact into the singularity to destroy it.

import * as THREE from "three";
import { Scene3D, fresnelMaterial, noise3 } from "../core/scene3d.js";
import { GLYPHS } from "../core/glyphs.js";

const MAX_ITEMS = 9;
const DRAG = 0.6;            // velocity kept per second while drifting
const SUMMON_MS = 650;

function glyphTexture() {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#010806"; g.fillRect(0, 0, 128, 512);
    g.strokeStyle = "rgba(0,255,208,0.35)";
    g.lineWidth = 2;
    g.strokeRect(8, 8, 112, 496);
    g.fillStyle = "#5fffe0";
    g.font = "bold 38px 'Apple Symbols', 'Segoe UI Symbol', sans-serif";
    g.textAlign = "center";
    for (let y = 52; y < 500; y += 46) g.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], 64, y);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Each builder returns { group, update(t, dt, excite), wire } at unit radius.
const BUILDERS = {
    seedpod() {
        const geo = new THREE.IcosahedronGeometry(0.8, 5);
        const base = geo.attributes.position.array.slice();
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x0a8f6c, metalness: 0.1, roughness: 0.45, iridescence: 0.8, iridescenceIOR: 1.8, clearcoat: 0.4,
            emissive: 0x0bff9d, emissiveIntensity: 0.25, envMapIntensity: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.02, 32, 32), fresnelMaterial(0x3dffb8, 2));
        const group = new THREE.Group();
        group.add(mesh, halo);
        return {
            group, mesh, label: "SEED POD",
            update(t, dt, excite) {
                mat.emissiveIntensity = 0.2 + 0.15 * Math.sin(t * 2.5) + excite * 0.5;
                halo.material.uniforms.uTime.value = t;
                // Breathing organic surface: displace along the normal with animated noise.
                const pos = geo.attributes.position.array;
                const amp = 0.14 + excite * 0.18;
                for (let i = 0; i < pos.length; i += 3) {
                    const x = base[i], y = base[i + 1], z = base[i + 2];
                    const n = noise3(x * 2.2 + t * 0.8, y * 2.2, z * 2.2 - t * 0.6);
                    const s = 1 + n * amp;
                    pos[i] = x * s; pos[i + 1] = y * s; pos[i + 2] = z * s;
                }
                geo.attributes.position.needsUpdate = true;
                geo.computeVertexNormals();
            },
        };
    },

    monolith() {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x05070a, metalness: 0.9, roughness: 0.18, emissive: 0xffffff, emissiveMap: glyphTexture(), emissiveIntensity: 1,
        });
        const box = new THREE.BoxGeometry(0.85, 1.8, 0.24);
        const mesh = new THREE.Mesh(box, mat);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box),
            new THREE.LineBasicMaterial({ color: 0x5fffe0, toneMapped: false }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 32), fresnelMaterial(0x00ffd0, 3, 0.8));
        halo.scale.set(0.65, 1.1, 0.4);
        const group = new THREE.Group();
        group.add(mesh, edges, halo);
        return {
            group, mesh, label: "MONOLITH",
            update(t, dt, excite) {
                mat.emissiveIntensity = 2.2 + 0.8 * Math.sin(t * 3) + excite * 2;
                halo.material.uniforms.uTime.value = t;
            },
        };
    },

    gyroscope() {
        const group = new THREE.Group();
        const colors = [0x00ffd0, 0xb18cff, 0xff5fa2];
        const rings = [1, 0.78, 0.56].map((r, i) => {
            const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 12, 96),
                new THREE.MeshBasicMaterial({ color: colors[i], toneMapped: false }));
            group.add(m);
            return m;
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), fresnelMaterial(0x00ffd0, 1.5));
        group.add(core, glow);
        return {
            group, mesh: core, label: "GYROSCOPE",
            update(t, dt, excite) {
                const s = 1 + excite * 3;
                rings[0].rotation.x += dt * 1.1 * s;
                rings[1].rotation.y += dt * 1.7 * s;
                rings[2].rotation.x -= dt * 2.3 * s; rings[2].rotation.z += dt * 0.9 * s;
                glow.material.uniforms.uTime.value = t;
            },
        };
    },

    bioorb() {
        const group = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), fresnelMaterial(0x7cffb2, 1.8));
        const n = 260, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 0.8);
            pos.set([v.x, v.y, v.z], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const motes = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xcfffe6, size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        group.add(shell, motes);
        return {
            group, mesh: shell, label: "BIO-ORB",
            update(t, dt, excite) {
                shell.material.uniforms.uTime.value = t;
                shell.material.uniforms.uIntensity.value = 1 + excite;
                motes.rotation.y += dt * (0.8 + excite * 4);
                motes.rotation.z += dt * 0.3;
            },
        };
    },

    shards() {
        const group = new THREE.Group();
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x9d6bff, metalness: 0.3, roughness: 0.08, iridescence: 1, flatShading: true, clearcoat: 1,
            emissive: 0x6a2bff, emissiveIntensity: 0.45,
        });
        const shardGeo = new THREE.OctahedronGeometry(0.32, 0);
        const edgeGeo = new THREE.EdgesGeometry(shardGeo);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xe6d9ff, toneMapped: false, transparent: true, opacity: 0.9 });
        const shards = Array.from({ length: 6 }, (_, i) => {
            const m = new THREE.Mesh(shardGeo, mat);
            m.add(new THREE.LineSegments(edgeGeo, edgeMat));
            m.scale.set(0.6, 1.5, 0.6);
            const a = (i / 6) * Math.PI * 2;
            m.userData = { a, r: 0.55 + (i % 2) * 0.15, y: (i % 3 - 1) * 0.3 };
            group.add(m);
            return m;
        });
        return {
            group, mesh: shards[0], label: "SHARDS",
            update(t, dt, excite) {
                shards.forEach((m, i) => {
                    const { a, r, y } = m.userData;
                    const spread = r * (1 + excite * 0.6);
                    m.position.set(Math.cos(a + t * 0.6) * spread, y + Math.sin(t * 2 + i) * 0.08, Math.sin(a + t * 0.6) * spread);
                    m.rotation.set(t + i, t * 0.7, 0);
                });
            },
        };
    },
};
const TYPES = Object.keys(BUILDERS);
const LABELS = { seedpod: "SEED POD", monolith: "MONOLITH", gyroscope: "GYROSCOPE", bioorb: "BIO-ORB", shards: "SHARDS" };

export default class Artifacts {
    constructor(env) {
        this.env = env;
        this.title = "Artifacts";
        this.hint = "🤏 pinch = grab · twist to rotate · release to fling  ·  🤏🤏 both hands = scale + rotate  ·  🖐 hold = summon  ·  throw into the singularity to destroy";
        this.grade = { saturation: 0.35, dim: 0.35, tint: "rgba(80, 0, 160, 0.25)", vignette: 0.7 };
        this.s3 = new Scene3D();
        this.items = [];
        this.typeIndex = 0;
        this.held = new Map();       // side -> { item, startRoll, startRot }
        this.dual = null;            // { item, sides, startDist, startScale, startAngle, startRot }
        this.rifts = new Map();      // side -> progress
        this.bursts = [];
        this.seeded = false;
    }

    activate() {}
    deactivate() {}

    onKey(k) {
        if (k === "c") [...this.items].forEach((it) => this.remove(it));
    }

    seed(w, h) {
        this.seeded = true;
        TYPES.slice(0, 4).forEach((type, i) => {
            const it = this.spawn(type, { x: w * (0.2 + i * 0.2), y: h * 0.38 }, Math.min(w, h) * 0.08);
            it.vel = { x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 40 };
        });
        this.typeIndex = 4;
    }

    spawn(type, pos, r) {
        if (this.items.length >= MAX_ITEMS) {
            const oldest = this.items.find((it) => it.state === "free" && !it.dying);
            if (oldest) oldest.dying = { t: 0, from: { ...oldest.pos } };
        }
        const obj = BUILDERS[type]();
        const wireSrc = obj.mesh.geometry;
        const wire = new THREE.LineSegments(new THREE.WireframeGeometry(wireSrc), new THREE.LineBasicMaterial({
            color: 0x00ffd0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        wire.scale.copy(obj.mesh.scale);
        obj.group.add(wire);
        this.s3.scene.add(obj.group);
        const it = { obj, wire, type, pos: { ...pos }, vel: { x: 0, y: 0 }, r, baseR: r, scale: 1, rotZ: 0, spinY: 0.4 + Math.random() * 0.5,
            grow: 0, state: "free", dying: null, excite: 0, phase: Math.random() * 10 };
        this.items.push(it);
        return it;
    }

    remove(it) {
        this.s3.scene.remove(it.obj.group);
        it.obj.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.emissiveMap?.dispose?.(); o.material?.dispose?.(); });
        this.items = this.items.filter((x) => x !== it);
        for (const [k, v] of this.held) if (v.item === it) this.held.delete(k);
        if (this.dual?.item === it) this.dual = null;
    }

    singularity(w, h) {
        // Screen bottom-right == raw bottom-left (the view is mirrored).
        const r = Math.min(w, h) * 0.07;
        return { x: w * 0.1, y: h * 0.8, r };
    }

    update({ hands, w, h, dt, t, now }) {
        this.s3.resize(w, h);
        if (!this.seeded) this.seed(w, h);
        const bySide = new Map(hands.map((hd) => [hd.side, hd]));
        const hole = this.singularity(w, h);

        // Release grabs whose hand vanished or stopped pinching.
        for (const [side, g] of [...this.held]) {
            const hd = bySide.get(side);
            if (!hd || !hd.pinch) {
                this.held.delete(side);
                if (this.dual?.sides.includes(side)) {
                    // Hand off to the remaining hand without a rotation jump.
                    const rest = this.dual.sides.find((s2) => s2 !== side);
                    const rg = this.held.get(rest), rh = bySide.get(rest);
                    if (rg && rh) { rg.startRoll = rh.roll; rg.startRot = rg.item.rotZ; }
                    this.dual = null;
                }
                if (![...this.held.values()].some((x) => x.item === g.item)) {
                    g.item.state = "free";
                    const v = hd ? hd.pinchVel : { x: 0, y: 0 };
                    g.item.vel = { x: v.x * 0.9, y: v.y * 0.9 };
                }
            }
        }

        for (const hd of hands) {
            // New pinch: grab the nearest artifact under the fingers.
            if (hd.pinch && !this.held.has(hd.side)) {
                const hit = this.items.filter((it) => !it.dying)
                    .map((it) => ({ it, d: Math.hypot(it.pos.x - hd.pinch.x, it.pos.y - hd.pinch.y) }))
                    .filter(({ it, d }) => d < it.r * 1.6)
                    .sort((a, b) => a.d - b.d)[0];
                if (hit) {
                    const other = [...this.held.entries()].find(([, g]) => g.item === hit.it);
                    this.held.set(hd.side, { item: hit.it, startRoll: hd.roll, startRot: hit.it.rotZ });
                    hit.it.state = "held";
                    if (other) {
                        // Second hand on the same artifact: two-handed scale + rotate.
                        const o = bySide.get(other[0]);
                        this.dual = {
                            item: hit.it, sides: [other[0], hd.side],
                            startDist: Math.hypot(o.pinch.x - hd.pinch.x, o.pinch.y - hd.pinch.y) || 1,
                            startAngle: Math.atan2(hd.pinch.y - o.pinch.y, hd.pinch.x - o.pinch.x),
                            startScale: hit.it.scale, startRot: hit.it.rotZ,
                        };
                    }
                }
            }

            // Open palm held: open a rift and summon the next artifact.
            if (hd.gesture === "Open_Palm" && !this.held.has(hd.side)) {
                const p = Math.min(1, hd.gestureMs / SUMMON_MS);
                this.rifts.set(hd.side, { p, x: hd.palm.x, y: hd.palm.y - hd.size * 1.1, size: hd.size });
                if (this.env.tracker.once(hd, "Open_Palm", SUMMON_MS)) {
                    const it = this.spawn(TYPES[this.typeIndex % TYPES.length], { x: hd.palm.x, y: hd.palm.y - hd.size * 1.1 }, Math.min(w, h) * 0.075);
                    it.vel = { x: 0, y: -120 };
                    this.typeIndex++;
                }
            } else {
                this.rifts.delete(hd.side);
            }
        }
        for (const side of [...this.rifts.keys()]) if (!bySide.has(side)) this.rifts.delete(side);

        // Drive held artifacts.
        if (this.dual) {
            const [a, b] = this.dual.sides.map((s) => bySide.get(s));
            if (a?.pinch && b?.pinch) {
                const it = this.dual.item;
                const dist = Math.hypot(a.pinch.x - b.pinch.x, a.pinch.y - b.pinch.y);
                const ang = Math.atan2(b.pinch.y - a.pinch.y, b.pinch.x - a.pinch.x);
                it.scale = Math.max(0.35, Math.min(2.5, this.dual.startScale * dist / this.dual.startDist));
                it.rotZ = this.dual.startRot + (ang - this.dual.startAngle);
                it.pos.x += ((a.pinch.x + b.pinch.x) / 2 - it.pos.x) * 0.5;
                it.pos.y += ((a.pinch.y + b.pinch.y) / 2 - it.pos.y) * 0.5;
            }
        } else {
            for (const [side, g] of this.held) {
                const hd = bySide.get(side);
                const it = g.item;
                it.pos.x += (hd.pinch.x - it.pos.x) * 0.55;
                it.pos.y += (hd.pinch.y - it.pos.y) * 0.55;
                it.rotZ = g.startRot + (hd.roll - g.startRoll);
                it.vel = { ...hd.pinchVel };
            }
        }

        this.integrate(w, h, dt, hole);
        for (const it of this.items) {
            const target = it.state === "held" ? 1 : 0;
            it.excite += (target - it.excite) * Math.min(1, dt * 6);
            it.obj.update(t + it.phase, dt, it.excite);
            it.wire.material.opacity = it.excite * 0.55;
        }
        this.bursts = this.bursts.filter((b) => t - b.t0 < 0.8);
        this.t = t;
    }

    integrate(w, h, dt, hole) {
        const damp = Math.pow(DRAG, dt);
        for (const it of [...this.items]) {
            if (it.dying) {
                // Spiral into the singularity while shrinking.
                it.dying.t += dt;
                const k = Math.min(1, it.dying.t / 0.7);
                const ang = k * Math.PI * 3;
                const rad = (1 - k) * Math.hypot(it.dying.from.x - hole.x, it.dying.from.y - hole.y);
                const a0 = Math.atan2(it.dying.from.y - hole.y, it.dying.from.x - hole.x);
                it.pos = { x: hole.x + Math.cos(a0 + ang) * rad, y: hole.y + Math.sin(a0 + ang) * rad };
                it.scale = Math.max(0.01, 1 - k);
                if (k >= 1) {
                    this.bursts.push({ x: hole.x, y: hole.y, t0: this.t ?? 0 });
                    this.remove(it);
                    continue;
                }
            } else if (it.state === "free") {
                it.pos.x += it.vel.x * dt;
                it.pos.y += it.vel.y * dt;
                it.vel.x *= damp; it.vel.y *= damp;
                // Gentle float.
                it.pos.y += Math.sin((this.t ?? 0) * 1.3 + it.phase) * 0.25;
                const r = it.r * it.scale;
                if (it.pos.x < r) { it.pos.x = r; it.vel.x = Math.abs(it.vel.x) * 0.6; }
                if (it.pos.x > w - r) { it.pos.x = w - r; it.vel.x = -Math.abs(it.vel.x) * 0.6; }
                const top = h * 0.2 + r;   // keep clear of the tabs
                if (it.pos.y < top) { it.pos.y = top; it.vel.y = Math.abs(it.vel.y) * 0.6; }
                if (it.pos.y > h - r) { it.pos.y = h - r; it.vel.y = -Math.abs(it.vel.y) * 0.6; }
                // Gravity well of the singularity.
                const dx = hole.x - it.pos.x, dy = hole.y - it.pos.y, d = Math.hypot(dx, dy);
                if (d < hole.r * 3.2) {
                    const pull = 900 * (1 - d / (hole.r * 3.2));
                    it.vel.x += (dx / d) * pull * dt;
                    it.vel.y += (dy / d) * pull * dt;
                }
                if (d < hole.r * 1.1) it.dying = { t: 0, from: { ...it.pos } };
                it.obj.group.rotation.y += it.spinY * dt;
            }
        }

        // Soft separation so artifacts don't overlap.
        const live = this.items.filter((it) => !it.dying);
        for (let i = 0; i < live.length; i++) {
            for (let j = i + 1; j < live.length; j++) {
                const a = live[i], b = live[j];
                const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, d = Math.hypot(dx, dy) || 1;
                const min = (a.r * a.scale + b.r * b.scale) * 0.85;
                if (d >= min) continue;
                const push = (min - d) / d * 0.5;
                const aF = a.state === "free", bF = b.state === "free";
                if (aF) { a.pos.x -= dx * push; a.pos.y -= dy * push; a.vel.x -= dx * push * 4; a.vel.y -= dy * push * 4; }
                if (bF) { b.pos.x += dx * push; b.pos.y += dy * push; b.vel.x += dx * push * 4; b.vel.y += dy * push * 4; }
            }
        }

        for (const it of this.items) {
            it.grow = Math.min(1, it.grow + dt * 2.5);
            const e = 1 + 2.7 * (it.grow - 1) ** 3 + 1.7 * (it.grow - 1) ** 2;
            it.obj.group.scale.setScalar(Math.max(0.001, it.r * it.scale * e));
            it.obj.group.position.set(it.pos.x, -it.pos.y, 0);
            it.obj.group.rotation.z = -it.rotZ;
        }
    }

    draw(ctx, { w, h, t }, labels) {
        const hole = this.singularity(w, h);
        ctx.save();
        // Singularity: dark core, lensing rings and an accretion swirl.
        const g = ctx.createRadialGradient(hole.x, hole.y, hole.r * 0.2, hole.x, hole.y, hole.r * 2.6);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.35, "rgba(0,0,0,0.95)");
        g.addColorStop(0.45, "rgba(255,120,60,0.55)");
        g.addColorStop(0.6, "rgba(177,140,255,0.25)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hole.x, hole.y, hole.r * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.lineCap = "round";
        for (let i = 0; i < 6; i++) {
            const a = t * (1.5 + i * 0.25) + i;
            ctx.strokeStyle = `rgba(255, ${150 + i * 15}, 90, ${0.55 - i * 0.07})`;
            ctx.lineWidth = 3 - i * 0.3;
            ctx.beginPath();
            ctx.ellipse(hole.x, hole.y, hole.r * (1.05 + i * 0.22), hole.r * (0.4 + i * 0.09), 0.35, a, a + 2.2);
            ctx.stroke();
        }
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(hole.x, hole.y, hole.r * 0.62, 0, Math.PI * 2); ctx.fill();

        // Rifts opening above summoning palms.
        for (const r of this.rifts.values()) {
            const s = r.size * 0.9 * r.p;
            ctx.strokeStyle = ctx.shadowColor = `rgba(0,255,208,${0.4 + 0.6 * r.p})`;
            ctx.shadowBlur = 20;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(r.x, r.y, s, s * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(r.x, r.y, s * 0.6, s * 0.2, 0, t * 4, t * 4 + Math.PI * 1.4); ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Destruction bursts.
        for (const b of this.bursts) {
            const k = (t - b.t0) / 0.8;
            ctx.strokeStyle = `rgba(255,170,90,${1 - k})`;
            ctx.lineWidth = 4 * (1 - k) + 1;
            ctx.beginPath(); ctx.arc(b.x, b.y, hole.r * (0.6 + k * 3), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();

        this.s3.render(ctx);

        labels.push({ x: hole.x, y: hole.y + hole.r * 1.6, align: "center", color: "#ffb35c", plain: true, text: "SINGULARITY" });
        for (const [, g2] of this.held) {
            const it = g2.item;
            labels.push({ x: it.pos.x, y: it.pos.y - it.r * it.scale * 1.35, align: "center", color: "#00ffd0",
                text: `${it.obj.label} · ×${it.scale.toFixed(2)} · ${((it.rotZ * 180) / Math.PI).toFixed(0)}°` });
        }
    }

    status() {
        return [
            `relics   ${this.items.filter((it) => !it.dying).length}/${MAX_ITEMS}`,
            `held     ${this.dual ? "two-handed" : this.held.size ? "one-handed" : "—"}`,
            `next     ${LABELS[TYPES[this.typeIndex % TYPES.length]]}`,
        ];
    }
}
