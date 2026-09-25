// three.js scene rendered in raw image pixel space (orthographic camera, y flipped), then
// composited into the main 2D canvas in its mirrored transform.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export class Scene3D {
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.add(new THREE.AmbientLight(0xbfe9ff, 0.45));
        const key = new THREE.DirectionalLight(0xffffff, 2);
        key.position.set(-0.4, 0.8, 1);
        const rim = new THREE.DirectionalLight(0x8a5cff, 1.4);
        rim.position.set(0.8, -0.3, 0.6);
        this.scene.add(key, rim);
        this.size = { w: 0, h: 0 };
    }

    resize(w, h) {
        if (this.size.w === w && this.size.h === h) return;
        this.size = { w, h };
        this.renderer.setSize(w, h, false);
        Object.assign(this.camera, { left: 0, right: w, top: 0, bottom: -h });
        this.camera.updateProjectionMatrix();
    }

    /** Raw image pixel -> scene position. */
    static at(x, y, z = 0) {
        return new THREE.Vector3(x, -y, z);
    }

    render(ctx) {
        this.renderer.render(this.scene, this.camera);
        ctx.drawImage(this.renderer.domElement, 0, 0);
    }

    dispose() {
        this.renderer.dispose();
    }
}

const FRESNEL_VERT = `
varying vec3 vNormal;
varying vec3 vPos;
void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Rim glow (orthographic view direction is +z) with flowing bands.
const FRESNEL_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
    float rim = pow(1.0 - abs(vNormal.z), uPower);
    float flow = 0.65 + 0.35 * sin(vPos.y * 9.0 + uTime * 3.0) * sin(vPos.x * 6.0 - uTime * 2.0);
    gl_FragColor = vec4(uColor * (rim * 1.6 + 0.1) * flow * uIntensity, rim);
}`;

export function fresnelMaterial(color, power = 2.2, intensity = 1) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) }, uTime: { value: 0 },
            uPower: { value: power }, uIntensity: { value: intensity },
        },
        vertexShader: FRESNEL_VERT,
        fragmentShader: FRESNEL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
    });
}

/** Cheap 3D value noise in [-1, 1] for CPU-side vertex animation. */
export function noise3(x, y, z) {
    const h = (i, j, k) => {
        const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
        return s - Math.floor(s);
    };
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const n = l(
        l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
        l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
    return n * 2 - 1;
}
