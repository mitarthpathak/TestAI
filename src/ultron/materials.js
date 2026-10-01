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
 * Every PBR base gets the shared surface-detail shader: micro scratches,
 * grime / roughness breakup, polished worn bevels, optional panel lines
 * (`panel`) and cable ribs (`ribs`). Tune with `detail`, `scratch`, `edge`.
 *
 * Panel lines are computed in the fragment shader from the mesh UVs, which
 * the geometry helpers emit in ~world units. `panel` = panels per unit,
 * `seed` decorrelates neighbouring parts, `lineWidth` / `lineDepth` tune the
 * grooves, `angle` rotates the panel grid (radians).
 */
import * as THREE from 'three';

const BASES = {
  chrome:    { color: 0x9aa1a9, metalness: 1.0, roughness: 0.26, clearcoat: 0.1, clearcoatRoughness: 0.25 },
  gunmetal:  { color: 0x6e757d, metalness: 1.0, roughness: 0.32, clearcoat: 0.06, clearcoatRoughness: 0.35 },
  darkMetal: { color: 0x3a3e44, metalness: 0.95, roughness: 0.4 },
  cavity:    { color: 0x08080a, metalness: 0.6, roughness: 0.75 },
  cable:     { color: 0x3a3c40, metalness: 0.9, roughness: 0.5 },
};

// per-base surface detail defaults (detail = grime/wear amount, scratch, edge wear, cable ribs)
const DETAIL_DEFAULTS = {
  chrome:    { detail: 1.0, scratch: 1.0, edge: 1.0 },
  gunmetal:  { detail: 1.0, scratch: 0.8, edge: 1.0 },
  darkMetal: { detail: 0.8, scratch: 0.5, edge: 0.8 },
  cavity:    { detail: 0.4, scratch: 0.0, edge: 0.3 },
  cable:     { detail: 0.8, scratch: 0.3, edge: 0.6, ribs: 70 },
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

const detailChunkPars = /* glsl */ `
varying vec3 vDetailPos;
varying vec3 vDetailNrm;
uniform float uDetailSeed;
uniform float uDetailAmt;
uniform float uScratch;
uniform float uEdge;
uniform float uRibs;

float dHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3) + uDetailSeed * 0.0137);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vNoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// thin directional scratches on a 2D plane, anti-aliased
float scratchPlane(vec2 q, float ang, float seed) {
  float c = cos(ang), s = sin(ang);
  q = mat2(c, -s, s, c) * q;
  vec3 sp = vec3(q.x * 3.0, q.y * 140.0, seed);
  float n = vNoise(sp) * 0.7 + vNoise(sp * vec3(0.5, 1.0, 1.0) + 3.1) * 0.3;
  float w = fwidth(sp.y);
  float line = smoothstep(0.83, 0.86, n) * (1.0 - smoothstep(0.3, 1.0, w));
  // break streaks into dashes
  line *= step(0.45, vNoise(vec3(q.x * 9.0, q.y * 9.0, seed + 5.0)));
  return line;
}
// triplanar scratch field
float scratchField(vec3 p, vec3 n) {
  vec3 w = abs(n); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  float a = scratchPlane(p.yz * 1.7, 0.35, 1.0) + scratchPlane(p.yz * 2.3, -1.1, 7.0);
  float b = scratchPlane(p.xz * 1.7, 0.8, 2.0) + scratchPlane(p.xz * 2.3, -0.4, 8.0);
  float c = scratchPlane(p.xy * 1.7, -0.6, 3.0) + scratchPlane(p.xy * 2.3, 1.3, 9.0);
  return clamp(a * w.x + b * w.y + c * w.z, 0.0, 1.0);
}
`;

const panelChunkParsOnly = panelChunkPars;

/**
 * Inject the shared surface-detail shader (micro scratches, grime, polished
 * worn edges, optional panel lines and cable ribs) into a PBR material.
 */
function applySurfaceShader(material, opts) {
  const uniforms = {
    uPanelScale: { value: opts.panel ?? 3 },
    uPanelSeed: { value: opts.seed ?? 1 },
    uPanelWidth: { value: opts.lineWidth ?? 0.006 },
    uPanelDepth: { value: opts.lineDepth ?? 1.0 },
    uPanelAngle: { value: opts.angle ?? 0 },
    uPanelVar: { value: opts.variation ?? 0.12 },
    uDetailSeed: { value: opts.seed ?? opts.detailSeed ?? 3 },
    uDetailAmt: { value: opts.detail ?? 1.0 },
    uScratch: { value: opts.scratch ?? 1.0 },
    uEdge: { value: opts.edge ?? 1.0 },
    uRibs: { value: opts.ribs ?? 0 },
  };
  const usePanel = !!opts.panel;
  const useRibs = !!opts.ribs;
  material.userData.panelUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPanelUv;\nvarying vec3 vDetailPos;\nvarying vec3 vDetailNrm;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPanelUv = uv;\nvDetailPos = position;\nvDetailNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + panelChunkParsOnly + detailChunkPars)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float panelGroove = 0.0;
        float panelRand = 0.5;
        ${usePanel ? `
        vec2 pf = panelField(vPanelUv);
        // a finer, fainter second layer of seams inside each panel
        vec2 pf2 = panelField(vPanelUv * 2.7 + 13.1);
        panelGroove = max(pf.x, pf2.x * 0.16);
        panelRand = pf.y;
        ` : ''}
        ${useRibs ? `
        {
          float rx = vPanelUv.x * uRibs;
          float rw = fwidth(rx);
          float rib = 1.0 - smoothstep(0.0, max(0.18, rw * 1.2), abs(fract(rx) - 0.5) * 2.0 - 0.6);
          panelGroove = max(panelGroove, (1.0 - rib) * (1.0 - smoothstep(0.3, 0.8, rw)));
        }` : ''}
        float grime = fbm3(vDetailPos * 3.1 + uDetailSeed);
        float grimeFine = vNoise(vDetailPos * 38.0 + uDetailSeed * 1.7);
        float scratches = scratchField(vDetailPos, normalize(vDetailNrm)) * uScratch;
        diffuseColor.rgb *= mix(1.0, 0.22, panelGroove * uPanelDepth);
        diffuseColor.rgb *= 1.0 + (panelRand - 0.5) * uPanelVar;
        diffuseColor.rgb *= mix(1.0, mix(0.74, 1.06, grime) * mix(0.94, 1.03, grimeFine), uDetailAmt);
        diffuseColor.rgb *= 1.0 + scratches * 0.35 * uDetailAmt;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(
          roughnessFactor
          + panelGroove * 0.35 * uPanelDepth
          + (panelRand - 0.5) * uPanelVar * 0.6
          + ((0.55 - grime) * 0.16 + (grimeFine - 0.5) * 0.05) * uDetailAmt
          - scratches * 0.12 * uDetailAmt,
          0.04, 1.0);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 gx3 = normalize(dFdx(-vViewPosition));
          vec3 gy3 = normalize(dFdy(-vViewPosition));
          // groove + scratch micro relief from screen-space gradients
          float relief = panelGroove * 0.18 * uPanelDepth + scratches * 0.06 * uDetailAmt;
          float dx = dFdx(relief), dy = dFdy(relief);
          normal = normalize(normal - (gx3 * dx + gy3 * dy) * 1.0);
          // polished, worn bevels: curvature from the normal's screen derivative
          float curv = clamp(length(fwidth(normal)) * 2.2 * uEdge, 0.0, 1.0);
          curv = smoothstep(0.15, 0.85, curv);
          diffuseColor.rgb *= 1.0 + curv * 0.3 * uDetailAmt;
          roughnessFactor = clamp(roughnessFactor - curv * 0.14 * uDetailAmt, 0.04, 1.0);
        }`
      );
  };
  material.customProgramCacheKey = () => `ultron-surface-v3-${usePanel ? 1 : 0}${useRibs ? 1 : 0}`;
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
      const { panel, seed, lineWidth, lineDepth, angle, variation, detail, scratch, edge, ribs, ...overrides } = opts || {};
      mat = new THREE.MeshPhysicalMaterial({ ...base, ...overrides });
      mat.envMapIntensity = this.envIntensity;
      const d = DETAIL_DEFAULTS[name] || {};
      applySurfaceShader(mat, {
        panel, seed, lineWidth, lineDepth, angle, variation,
        detail: detail ?? d.detail, scratch: scratch ?? d.scratch, edge: edge ?? d.edge, ribs: ribs ?? d.ribs,
      });
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
