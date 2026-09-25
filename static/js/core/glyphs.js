// Alien script: a Standard-Galactic-style substitution alphabet plus a "decode" scramble effect.

export const GLYPHS = "⏃⏚☊⎅⟒⎎☌⊑⟟⟊☍⌰⋔⋏⍜⌿⍾⍀⌇⏁⎍⎐⍙⌖⊬⋉";

export function toGlyphs(text) {
    return [...text.toLowerCase()].map((ch) => {
        const i = ch.charCodeAt(0) - 97;
        return i >= 0 && i < 26 ? GLYPHS[i] : ch;
    }).join("");
}

/** Text that resolves from alien glyphs into English as progress goes 0 -> 1. */
export function decode(text, progress) {
    const n = Math.floor(text.length * Math.min(1, Math.max(0, progress)));
    return [...text].map((ch, i) => {
        if (i < n || ch === " ") return ch;
        return GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }).join("");
}

export const glyphAt = (i) => GLYPHS[((i % GLYPHS.length) + GLYPHS.length) % GLYPHS.length];
