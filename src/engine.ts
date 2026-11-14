// ============================================================
// Rendu : WebGL + post-process (halo lumineux pour les sorts, anticrénelage, vignette).
// Trois niveaux de qualité ; le niveau baisse tout seul si le téléphone rame.
// ============================================================
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect, HueSaturationEffect } from 'postprocessing';

export type Quality = 'high' | 'medium' | 'low';
const touch = matchMedia('(pointer: coarse)').matches;
const qp = new URLSearchParams(location.search).get('quality');

export class Engine {
  renderer: THREE.WebGLRenderer; composer!: EffectComposer; quality: Quality;
  private locked = !!qp; private slow = 0; private fast = 0;
  constructor(canvas: HTMLCanvasElement, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera) {
    this.quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : touch ? 'medium' : 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.build();
    addEventListener('resize', () => this.resize());
  }
  private build() {
    this.composer?.dispose();
    const q = this.quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // seul ce qui dépasse 1 (sorts, flammes, éclats) s'illumine : le décor reste net et coloré
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: .95, luminanceSmoothing: .25, intensity: q === 'low' ? 1.1 : 1.6, radius: .7 });
    const fx: any[] = [bloom, new HueSaturationEffect({ saturation: .12 }), new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), new VignetteEffect({ darkness: .38, offset: .3 })];
    if (q !== 'low') fx.push(new SMAAEffect({ preset: q === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM }));
    this.composer.addPass(new EffectPass(this.camera, ...fx));
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setQuality(q: Quality) { if (q !== this.quality) { this.quality = q; this.build(); } }
  /** Surveille la fluidité : baisse la qualité après quelques secondes de saccades. */
  render(dt: number) {
    this.composer.render(dt);
    if (this.locked) return;
    if (dt > 1 / 38) { this.slow += dt; this.fast = 0; } else { this.fast += dt; this.slow = Math.max(0, this.slow - dt * .5); }
    if (this.slow > 3 && this.quality !== 'low') { this.slow = 0; this.setQuality(this.quality === 'high' ? 'medium' : 'low'); }
  }
}
