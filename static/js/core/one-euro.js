// One Euro Filter (Casiez et al., CHI 2012): an adaptive low-pass filter for noisy real-time signals.
// Low speed -> low cutoff (kills landmark jitter); high speed -> high cutoff (kills lag).

class LowPass {
    constructor() { this.y = null; }
    filter(x, alpha) {
        this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
        return this.y;
    }
}

export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.reset();
    }

    reset() {
        this.x = new LowPass();
        this.dx = new LowPass();
        this.tPrev = null;
    }

    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }

    /** @param {number} value  @param {number} t  timestamp in seconds */
    filter(value, t) {
        if (this.tPrev === null) {
            this.tPrev = t;
            this.dx.y = 0;
            return this.x.filter(value, 1);
        }
        const dt = Math.max(t - this.tPrev, 1e-3);
        this.tPrev = t;
        const dValue = (value - this.x.y) / dt;
        const edx = this.dx.filter(dValue, OneEuroFilter.alpha(this.dCutoff, dt));
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        return this.x.filter(value, OneEuroFilter.alpha(cutoff, dt));
    }
}
