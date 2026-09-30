/**
 * Shared material library.
 *
 * OWNER: lead / integrator. Parts obtain materials through `ctx.materials`:
 *
 *   const m = ctx.materials;
 *   m.get('chrome')                         // shared base material
 *   m.get('chrome', { panel: 3.2, seed: 7 }) // variant with procedural panel lines
 *   m.get('eyeGlow')                         // HDR red, drives the bloom pass
 *
 * Base names: chrome, gunmetal, darkMetal, cavity, eyeGlow, redAccent, cable
 *
 * Panel lines are computed in the fragment shader from the mesh UVs, which
 * the geometry helpers emit in ~world units. `panel` = panels per unit,
 * `seed` decorrelates neighbouring parts, `lineWidth` / `lineDepth` tune the
 * grooves, `angle` rotates the panel grid (radians).
 */
import * as THREE from 'three';

const BASES = {
  chrome:    { color: 0x8c9096, metalness: 1.0, roughness: 0.26, clearcoat: 0.25, clearcoatRoughness: 0.25 },
  gunmetal:  { color: 0x5d6167, metalness: 1.0, roughness: 0.34, clearcoat: 0.15, clearcoatRoughness: 0.35 },
  darkMetal: { color: 0x2c2e32, metalness: 0.95, roughness: 0.42 },
  cavity:    { color: 0x08080a, metalness: 0.6, roughness: 0.75 },
  cable:     { color: 0x3a3c40, metalness: 0.9, roughness: 0.5 },
};

export const GLOW_COLOR = new THREE.Color(1.0, 0.07, 0.04);

const panelChunkPars = /* glsl */ `
varying vec2 vPanelUv;
uniform float uPanelScale;
uniform float uPanelSeed;
uniform float uPanelWidth;
uniform float uPanelDepth;
uniform float uPanelAngle;
uniform float uPanelVar;

float pHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uPanelSeed * 0.1731);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// returns x: groove amount (0..1), y: per-panel random value
vec2 panelField(vec2 uv) {
  float ca = cos(uPanelAngle), sa = sin(uPanelAngle);
  vec2 p = mat2(ca, -sa, sa, ca) * uv * uPanelScale;
  float row = floor(p.y);
  float fy = fract(p.y);
  float k = mix(0.55, 1.6, pHash(vec2(row, 3.1)));
  float x = p.x * k + pHash(vec2(row, 9.7)) * 7.0;
  float cell = floor(x);
  float fx = fract(x);
  // skip some horizontal seams so panels have different heights
  float keepTop = step(0.3, pHash(vec2(cell, row + 0.5)));
  // anti-aliased line width: never thinner than ~1.2px
  vec2 fw = fwidth(p);
  float w = max(uPanelWidth * uPanelScale, fw.y * 1.2);
  float wx = max(uPanelWidth * uPanelScale * k, fw.x * k * 1.2);
  float gx = 1.0 - smoothstep(0.0, wx, min(fx, 1.0 - fx));
  float gy = 1.0 - smoothstep(0.0, w, min(fy, 1.0 - fy));
  gy *= mix(1.0, keepTop, step(0.5, fy));
  // fade lines out when they would alias (far away / grazing)
  float fade = 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y));
  gx *= fade; gy *= fade;
  float groove = max(gx, gy);
  return vec2(groove, pHash(vec2(cell, row)));
}
`;

function applyPanelShader(material, opts) {
  const uniforms = {
    uPanelScale: { value: opts.panel ?? 3 },
    uPanelSeed: { value: opts.seed ?? 1 },
    uPanelWidth: { value: opts.lineWidth ?? 0.006 },
    uPanelDepth: { value: opts.lineDepth ?? 1.0 },
    uPanelAngle: { value: opts.angle ?? 0 },
    uPanelVar: { value: opts.variation ?? 0.12 },
  };
  material.userData.panelUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPanelUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPanelUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + panelChunkPars)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 pf = panelField(vPanelUv);
        float panelGroove = pf.x;
        diffuseColor.rgb *= mix(1.0, 0.22, panelGroove * uPanelDepth);
        diffuseColor.rgb *= 1.0 + (pf.y - 0.5) * uPanelVar;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + panelGroove * 0.35 * uPanelDepth + (pf.y - 0.5) * uPanelVar * 0.6, 0.04, 1.0);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // gentle groove shading: tilt the normal across the seam using the
          // screen-space gradient of the (already anti-aliased) groove mask
          vec3 gx3 = dFdx(-vViewPosition);
          vec3 gy3 = dFdy(-vViewPosition);
          float dx = dFdx(panelGroove), dy = dFdy(panelGroove);
          vec3 bend = (normalize(gx3) * dx + normalize(gy3) * dy) * 0.18 * uPanelDepth;
          normal = normalize(normal - bend);
        }`
      );
  };
  material.customProgramCacheKey = () => 'ultron-panel-v2';
}

export class MaterialLibrary {
  constructor() {
    this.cache = new Map();
    this.all = new Set();
    this.envIntensity = 1.0;
  }

  _key(name, opts) {
    return name + '|' + JSON.stringify(opts || {});
  }

  /** Get (and cache) a material. Options create a variant. */
  get(name, opts = null) {
    const key = this._key(name, opts);
    if (this.cache.has(key)) return this.cache.get(key);
    let mat;
    if (name === 'eyeGlow') {
      mat = new THREE.MeshBasicMaterial({ color: GLOW_COLOR.clone().multiplyScalar(opts?.intensity ?? 9), toneMapped: false });
      mat.userData.baseColor = mat.color.clone();
    } else if (name === 'redAccent') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x220000, emissive: GLOW_COLOR, emissiveIntensity: opts?.intensity ?? 1.6, metalness: 0.2, roughness: 0.6,
      });
    } else {
      const base = BASES[name];
      if (!base) throw new Error(`Unknown material "${name}"`);
      const { panel, seed, lineWidth, lineDepth, angle, variation, ...overrides } = opts || {};
      mat = new THREE.MeshPhysicalMaterial({ ...base, ...overrides });
      mat.envMapIntensity = this.envIntensity;
      if (panel) applyPanelShader(mat, { panel, seed, lineWidth, lineDepth, angle, variation });
    }
    mat.name = key;
    this.cache.set(key, mat);
    this.all.add(mat);
    return mat;
  }

  /** Set env map intensity on every PBR material (debug GUI). */
  setEnvIntensity(v) {
    this.envIntensity = v;
    for (const m of this.all) if ('envMapIntensity' in m) m.envMapIntensity = v;
  }

  /** Scale the HDR glow of every eyeGlow material (animation hook). */
  setGlow(k) {
    for (const m of this.all) {
      if (m.userData.baseColor) m.color.copy(m.userData.baseColor).multiplyScalar(k);
    }
  }

  setWireframe(on) {
    for (const m of this.all) m.wireframe = on;
  }

  dispose() {
    for (const m of this.all) m.dispose();
    this.cache.clear();
    this.all.clear();
  }
}
