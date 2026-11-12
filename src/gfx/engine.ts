// ============================================================
// Moteur de rendu — chaîne post-process et niveaux de qualité.
// Tout ce qui fait passer d'un rendu « WebGL brut » à une image de jeu :
// occlusion ambiante, halo HDR, anticrénelage, étalonnage filmique, grain.
// ============================================================
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect, BlendFunction,
  HueSaturationEffect, BrightnessContrastEffect, ChromaticAberrationEffect, DepthOfFieldEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export type Quality = 'high' | 'medium' | 'low';

/** Direction artistique d'un étage : courbe, exposition, halo, occlusion. */
export interface Look {
  tone: 'agx' | 'aces' | 'neutral';
  exposure: number;
  bloom: { intensity: number; threshold: number; smoothing: number; radius?: number };
  ao: { radius: number; intensity: number; falloff: number; color?: string };
  saturation: number;     // -1..1
  contrast: number;       // -1..1
  vignette: number;       // 0..1
  grain: number;          // opacité du grain filmique
}

export const LEGACY_LOOK: Look = {
  tone: 'aces', exposure: 1, bloom: { intensity: .85, threshold: .92, smoothing: .12 },
  ao: { radius: 1.6, intensity: 2.2, falloff: 1 }, saturation: .05, contrast: .04, vignette: .35, grain: .035,
};

let renderer: THREE.WebGLRenderer;
let composer: EffectComposer | null = null;
let aoPass: any = null;
let bloom: BloomEffect | null = null, tone: ToneMappingEffect | null = null;
let chroma: ChromaticAberrationEffect | null = null;
let hueSat: HueSaturationEffect | null = null, bc: BrightnessContrastEffect | null = null;
let vig: VignetteEffect | null = null, noise: NoiseEffect | null = null;
let sceneRef: THREE.Scene, camRef: THREE.PerspectiveCamera;
let dof: DepthOfFieldEffect | null = null, dofWanted = false;
const preRender: ((r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera) => void)[] = [];
let quality: Quality = 'high', locked = false;
let look: Look = LEGACY_LOOK;
let onQuality: ((q: Quality) => void) | null = null;

const isTouch = matchMedia('(pointer: coarse)').matches;

export function getQuality() { return quality; }
export function getRenderer() { return renderer; }

export function createEngine(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
  qualityChanged: (q: Quality) => void) {
  sceneRef = scene; camRef = camera; onQuality = qualityChanged;
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // la courbe est appliquée par le post-process (sinon elle serait appliquée deux fois)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') { quality = q; locked = true; }
  else quality = isTouch ? 'medium' : 'high';
  renderer.shadowMap.autoUpdate = true;
  build();
  return renderer;
}

function pixelRatio() {
  const dpr = devicePixelRatio || 1;
  if (quality === 'high') return Math.min(dpr, 1.75);
  if (quality === 'medium') return Math.min(dpr, 1.35);
  return Math.min(dpr, 1);
}

function build() {
  composer?.dispose();
  composer = null; aoPass = null;
  renderer.setPixelRatio(pixelRatio());
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.setSize(innerWidth, innerHeight, false);

  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(sceneRef, camRef));
  dof = null;

  if (quality !== 'low') {
    aoPass = new N8AOPostPass(sceneRef, camRef, innerWidth, innerHeight);
    aoPass.configuration.halfRes = quality === 'medium';
    aoPass.configuration.depthAwareUpsampling = true;
    aoPass.configuration.gammaCorrection = false;
    aoPass.setQualityMode(quality === 'high' ? 'Medium' : 'Performance');
    composer.addPass(aoPass);
  }

  // profondeur de champ (plans de cinéma uniquement) : passe séparée, c'est une convolution
  if (dofWanted && quality !== 'low') {
    dof = new DepthOfFieldEffect(camRef, { focusDistance: 18, focusRange: 10, bokehScale: quality === 'high' ? 1.9 : 1.5, resolutionScale: .5 });
    composer.addPass(new EffectPass(camRef, dof));
  }

  bloom = new BloomEffect({
    mipmapBlur: true, intensity: 1, luminanceThreshold: .9, luminanceSmoothing: .1, radius: .72,
    resolutionScale: quality === 'high' ? .5 : .35,
  });
  tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  hueSat = new HueSaturationEffect({ saturation: 0 });
  bc = new BrightnessContrastEffect({ contrast: 0 });
  vig = new VignetteEffect({ offset: .32, darkness: .4 });
  noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: .25 });

  // Ordre : halo en HDR → courbe → étalonnage (en LDR) → aberration/vignette/grain
  const effects: any[] = [];
  if (quality !== 'low') effects.push(bloom);
  effects.push(tone, hueSat, bc);
  if (quality !== 'low') effects.push(chroma);
  effects.push(vig);
  if (quality === 'high') effects.push(noise);
  composer.addPass(new EffectPass(camRef, ...effects));
  if (quality !== 'low') composer.addPass(new EffectPass(camRef, new SMAAEffect({ preset: quality === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM })));
  composer.setSize(innerWidth, innerHeight, false);
  applyLook(look);
}

export function applyLook(l: Look) {
  look = l;
  if (!composer) return;
  renderer.toneMappingExposure = l.exposure;
  if (tone) {
    tone.mode = l.tone === 'agx' ? ToneMappingMode.AGX : l.tone === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.NEUTRAL;
  }
  // l'exposition est portée par le renderer ; ToneMappingEffect la relit
  if (bloom) {
    bloom.intensity = l.bloom.intensity;
    bloom.luminanceMaterial.threshold = l.bloom.threshold;
    bloom.luminanceMaterial.smoothing = l.bloom.smoothing;
    if (l.bloom.radius !== undefined) (bloom as any).mipmapBlurPass.radius = l.bloom.radius;
  }
  if (aoPass) {
    aoPass.configuration.aoRadius = l.ao.radius;
    aoPass.configuration.intensity = l.ao.intensity;
    aoPass.configuration.distanceFalloff = l.ao.falloff;
    aoPass.configuration.color = new THREE.Color(l.ao.color ?? '#000000');
  }
  if (hueSat) hueSat.saturation = l.saturation;
  if (bc) bc.contrast = l.contrast;
  if (vig) vig.darkness = l.vignette;
  if (noise) noise.blendMode.opacity.value = l.grain;
}

/** Secousse d'impact : un peu d'aberration chromatique en plus du tremblement de caméra. */
export function setImpact(v: number) {
  if (chroma) chroma.offset.set(v * .0045, v * .0025);
}

export function resizeEngine() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
  composer?.setSize(innerWidth, innerHeight, false);
}

export function render(dt: number) {
  for (const f of preRender) f(renderer, camRef);
  if (composer) composer.render(dt); else renderer.render(sceneRef, camRef);
}

/** Change de scène (rue ↔ hall) : la chaîne est reconstruite sur la nouvelle scène. */
export function setScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera, hooks: ((r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera) => void)[]) {
  sceneRef = scene; camRef = camera;
  preRender.length = 0; preRender.push(...hooks);
  build();
}

/** Profondeur de champ : activer/désactiver reconstruit la chaîne ; régler la mise au point est gratuit. */
export function setDof(on: boolean) { if (on !== dofWanted) { dofWanted = on; build(); } }
export function focusDof(dist: number, range: number) {
  if (!dof) return;
  (dof.cocMaterial as any).focusDistance = dist;
  (dof.cocMaterial as any).focusRange = range;
}
export const touchDevice = isTouch;

// ---------- qualité adaptative ----------
// On mesure par fenêtres de 3 s ; on ne descend qu'une marche à la fois et on ne remonte jamais
// (un téléphone qui chauffe ralentit : remonter ferait yoyo).
let winStart = 0, winFrames = 0, warm = 0;
export function watchPerf(now: number) {
  if (locked || document.hidden) { winStart = 0; return; }
  if (!winStart) { winStart = now; winFrames = 0; return; }
  winFrames++;
  const el = now - winStart;
  if (el < 3000) return;
  const fps = winFrames / (el / 1000);
  winStart = now; winFrames = 0;
  if (warm++ < 1) return;               // la première fenêtre inclut la compilation des shaders
  const next: Quality | null = quality === 'high' && fps < 42 ? 'medium' : quality === 'medium' && fps < 27 ? 'low' : null;
  if (next) { setQuality(next); }
  else if (quality === 'low' || fps > 50) locked = true;
}

export function setQuality(q: Quality) {
  if (q === quality) return;
  quality = q;
  build();
  onQuality?.(q);
}
