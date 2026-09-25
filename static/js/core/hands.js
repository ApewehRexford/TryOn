// Per-hand state for every mode: pixel landmarks, palm, size, velocity, pinch (with hysteresis and
// One Euro smoothing), extended fingers, 3D orientation from world landmarks, and gesture timing.

import { OneEuroFilter } from "./one-euro.js";

const PALM = [0, 5, 9, 13, 17];
export const TIPS = [4, 8, 12, 16, 20];
const PINCH_ON = 0.3, PINCH_OFF = 0.45;   // thumb–index distance / palm size

export const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const lerp2 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

export class HandTracker {
    constructor() {
        this.state = new Map();
    }

    // MediaPipe labels handedness assuming a mirrored selfie image; our frames are raw, so swap.
    static side(result, i) {
        const raw = result.handedness?.[i]?.[0]?.categoryName;
        return raw === "Left" ? "Right" : raw === "Right" ? "Left" : `Hand${i}`;
    }

    update(result, w, h, dt, now) {
        const seen = new Set();
        const tSec = now / 1000;
        const hands = (result.landmarks || []).map((lm, i) => {
            let side = HandTracker.side(result, i);
            if (seen.has(side)) side = `${side}${i}`;
            seen.add(side);
            const P = (k) => ({ x: lm[k].x * w, y: lm[k].y * h });
            const palm = PALM.map(P).reduce((a, p) => ({ x: a.x + p.x / 5, y: a.y + p.y / 5 }), { x: 0, y: 0 });
            const p0 = P(0), p9 = P(9);
            const size = Math.hypot(p9.x - p0.x, p9.y - p0.y) || 1;
            const g = result.gestures?.[i]?.[0];
            const gesture = g && g.score > 0.5 ? g.categoryName : "None";

            let st = this.state.get(side);
            if (!st) {
                st = {
                    palm, vel: { x: 0, y: 0 }, pinching: false, pinch: null, pinchVel: { x: 0, y: 0 },
                    fx: new OneEuroFilter(1.5, 0.02), fy: new OneEuroFilter(1.5, 0.02),
                    gesture, since: now, fired: new Set(),
                };
                this.state.set(side, st);
            }
            if (st.gesture !== gesture) { st.gesture = gesture; st.since = now; st.fired.clear(); }

            const inv = 1 / Math.max(dt, 1e-3);
            st.vel = lerp2(st.vel, { x: (palm.x - st.palm.x) * inv, y: (palm.y - st.palm.y) * inv }, 0.5);
            st.palm = palm;

            // Pinch with hysteresis so it doesn't flicker at the threshold.
            const t4 = P(4), t8 = P(8);
            const ratio = Math.hypot(t4.x - t8.x, t4.y - t8.y) / size;
            if (!st.pinching && ratio < PINCH_ON) st.pinching = true;
            else if (st.pinching && ratio > PINCH_OFF) st.pinching = false;
            let pinch = null;
            if (st.pinching) {
                const raw = { x: (t4.x + t8.x) / 2, y: (t4.y + t8.y) / 2 };
                pinch = { x: st.fx.filter(raw.x, tSec), y: st.fy.filter(raw.y, tSec) };
                st.pinchVel = st.pinch ? lerp2(st.pinchVel, { x: (pinch.x - st.pinch.x) * inv, y: (pinch.y - st.pinch.y) * inv }, 0.5) : { x: 0, y: 0 };
            } else {
                st.fx.reset(); st.fy.reset();
            }
            st.pinch = pinch;

            // Extended fingers: tip farther from the wrist than its middle joint (thumb: from the pinky base).
            const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
            const extended = [
                d(4, 17) > d(3, 17) * 1.05,
                ...[[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => d(tip, 0) > d(pip, 0) * 1.1),
            ];

            // Orientation basis from metric world landmarks, in three.js axes (y up, z toward camera).
            let basis = null;
            const wl = result.worldLandmarks?.[i];
            if (wl) {
                const v = (k) => [wl[k].x, -wl[k].y, -wl[k].z];
                const up = norm(sub(v(9), v(0)));
                let normal = norm(cross(norm(sub(v(5), v(17))), up));
                if (side.startsWith("Left")) normal = normal.map((x) => -x);
                basis = { up, normal, across: norm(cross(up, normal)) };
            }

            return {
                side, lm, P, palm, size, gesture, gestureMs: now - st.since,
                vel: st.vel, pinch, pinchVel: st.pinchVel, pinchRatio: ratio,
                extended, fingerCount: extended.filter(Boolean).length,
                tips: TIPS.map(P), basis,
                roll: Math.atan2(p9.y - p0.y, p9.x - p0.x) + Math.PI / 2,
            };
        });
        for (const [side, st] of this.state) if (!seen.has(side)) { st.pinch = null; st.pinching = false; }
        return hands;
    }

    /** True exactly once per hold of `name` lasting at least holdMs. */
    once(hand, name, holdMs = 300) {
        const st = this.state.get(hand.side);
        if (!st || hand.gesture !== name || hand.gestureMs < holdMs || st.fired.has(name)) return false;
        st.fired.add(name);
        return true;
    }
}
