// ============================================================
// Rendu : WebGL + post-process (halo lumineux pour les sorts, anticrénelage, vignette).
// Résolution adaptative : on vise 60 images/s en ajustant finement la résolution,
// sans jamais descendre sous un plancher net (avant : on tombait à une image pixelisée).
// ============================================================
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect, HueSaturationEffect } from 'postprocessing';

export type Quality = 'high' | 'medium' | 'low';
export const TOUCH = matchMedia('(pointer: coarse)').matches;
const qp = new URLSearchParams(location.search).get('quality');

export class Engine {
  renderer: THREE.WebGLRenderer; composer!: EffectComposer; quality: Quality;
  ratio: number; private maxRatio: number; private minRatio: number;
  private acc = 0; private frames = 0; private warm = 0; private good = 0;
  onShadows: (on: boolean) => void = () => {};
  constructor(canvas: HTMLCanvasElement, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera) {
    this.quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : TOUCH ? 'medium' : 'high';
    const dpr = devicePixelRatio || 1;
    this.maxRatio = Math.min(dpr, this.quality === 'low' ? 1.5 : 2);
    this.minRatio = Math.min(this.maxRatio, TOUCH ? 1.3 : 1);
    this.ratio = this.maxRatio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.ratio);
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    // seul ce qui dépasse 1 (sorts, flammes, éclats) s'illumine : le décor reste net et coloré
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: .95, luminanceSmoothing: .25, intensity: 1.6, radius: .7, resolutionScale: TOUCH ? .5 : 1 } as any);
    this.composer.addPass(new EffectPass(camera, bloom, new HueSaturationEffect({ saturation: .12 }), new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ darkness: .38, offset: .3 }), new SMAAEffect({ preset: TOUCH ? SMAAPreset.LOW : SMAAPreset.HIGH })));
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  render(dt: number) {
    this.composer.render(dt);
    if (qp) return;
    // mesure sur 1 seconde, après 3 s de chauffe (compilation des shaders)
    this.warm += dt; if (this.warm < 3) return;
    this.acc += dt; this.frames++;
    if (this.acc < 1) return;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    if (fps < 50 && this.ratio > this.minRatio) { this.ratio = Math.max(this.minRatio, this.ratio - .15); this.good = 0; this.resize(); }
    else if (fps < 40 && this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.onShadows(false); }
    else if (fps > 58) { if (++this.good >= 4 && this.ratio < this.maxRatio) { this.ratio = Math.min(this.maxRatio, this.ratio + .1); this.good = 0; this.resize(); } }
    else this.good = 0;
  }
}
