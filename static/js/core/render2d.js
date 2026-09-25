// Shared 2D drawing: graded camera background, alien hand skeletons, and screen-space labels.

import { HAND_CONNECTIONS, TIPS } from "./hands.js";
import { toGlyphs } from "./glyphs.js";

export const HAND_COLORS = { Left: "124, 255, 178", Right: "177, 140, 255" };
export const colorOf = (side) => HAND_COLORS[side.replace(/\d+$/, "")] || "0, 255, 208";

/**
 * Draw the camera frame with a colour grade (world transform already mirrored).
 * @param grade {{ saturation?: number, dim?: number, tint?: string, vignette?: number }}
 */
export function drawBackground(ctx, video, w, h, { saturation = 1, dim = 0, tint = null, vignette = 0.5 } = {}) {
    ctx.drawImage(video, 0, 0, w, h);
    ctx.save();
    if (saturation < 1) {
        // "saturation" blending with a grey fill removes colour; alpha controls how much.
        ctx.globalCompositeOperation = "saturation";
        ctx.fillStyle = `rgba(128,128,128,${1 - saturation})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (tint) {
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    if (dim > 0) {
        ctx.fillStyle = `rgba(2, 6, 10, ${dim})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (vignette > 0) {
        const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${vignette})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
}

/** Bioluminescent hand skeleton: glowing bones, nodes, pulsing fingertip rings. */
export function drawHands(ctx, hands, t, labels) {
    ctx.save();
    ctx.lineCap = "round";
    for (const hd of hands) {
        const c = colorOf(hd.side);
        const pts = hd.lm.map((_, k) => hd.P(k));
        for (const [width, alpha, blur] of [[7, 0.18, 14], [2, 0.9, 0]]) {
            ctx.strokeStyle = ctx.shadowColor = `rgba(${c}, ${alpha})`;
            ctx.shadowBlur = blur;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${c}, 1)`;
        pts.forEach((p, k) => {
            if (TIPS.includes(k)) return;
            ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
        });
        TIPS.forEach((k, i) => {
            const p = pts[k];
            const r = hd.size * 0.09 * (1 + 0.15 * Math.sin(t * 5 + i));
            ctx.strokeStyle = `rgba(${c}, 0.9)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
        });
        if (hd.pinch) {
            ctx.strokeStyle = `rgba(${c}, 1)`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(hd.pinch.x, hd.pinch.y, hd.size * 0.22, t * 3, t * 3 + Math.PI * 1.5); ctx.stroke();
            ctx.setLineDash([]);
        }
        const wrist = pts[0];
        labels.push({ x: wrist.x + hd.size * 0.4, y: wrist.y + hd.size * 0.55, color: `rgb(${c})`, plain: true,
            text: `${toGlyphs(hd.side.replace(/\d+$/, ""))} · ${hd.gesture === "None" ? "tracking" : hd.gesture.replace("_", " ").toLowerCase()}` });
    }
    ctx.restore();
}

/**
 * Labels are anchored in raw image space; x is flipped here so they land on the mirrored view.
 * Label: { x, y, text, color, plain?: glow text without a box, align?: "left" | "center", size?: scale }
 */
export function drawLabels(ctx, labels, w) {
    const base = Math.round(w / 72);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textBaseline = "middle";
    for (const { x, y, text, color, plain, align = "left", size = 1 } of labels) {
        const fs = Math.round(base * size);
        ctx.font = `600 ${fs}px "Space Mono", ui-monospace, Menlo, monospace`;
        ctx.textAlign = align;
        const sx = w - x, sy = Math.max(y, fs);
        if (!plain) {
            const tw = ctx.measureText(text).width;
            const left = align === "center" ? sx - tw / 2 : sx;
            ctx.fillStyle = "rgba(0, 8, 12, 0.7)";
            ctx.fillRect(left - 6, sy - fs * 0.75, tw + 12, fs * 1.5);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.5;
            ctx.strokeRect(left - 6, sy - fs * 0.75, tw + 12, fs * 1.5);
            ctx.globalAlpha = 1;
        } else {
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
        }
        ctx.fillStyle = color;
        ctx.fillText(text, sx, sy);
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}
