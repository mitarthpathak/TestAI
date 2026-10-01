/**
 * Ultron — assembles the rig + parts and exposes the animation API.
 * OWNER: lead / integrator.
 *
 * Future animation entry points (all safe to call every frame):
 *   ultron.rig.pose({ head: { ry: 0.3 }, jaw: { rx: 0.2 } })
 *   ultron.set('jaw', 'open', 0.6)          // any part param from paramSpec
 *   ultron.parts.eyes.params.glow           // current value
 *   ultron.setExplode(0..1)                 // exploded view of all parts
 *   ultron.idle.enabled = false             // stop built-in idle motion
 *   ultron.lookAt(x, y)                     // -1..1 screen space look target
 */
import * as THREE from 'three';
import * as anatomy from './anatomy.js';
import * as geo from './geometry.js';
import { Rig } from './rig.js';
import { PARTS } from './registry.js';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Ultron {
  constructor({ materials }) {
    this.materials = materials;
    this.rig = new Rig();
    this.object = new THREE.Group();
    this.object.name = 'ultron';
    this.object.add(this.rig.root);
    this.parts = {};
    this.status = {}; // id -> 'pending' | 'loading' | 'ready' | 'error'
    this.timings = {}; // id -> build ms (import + build + warp)
    for (const p of PARTS) this.status[p.id] = 'pending';
    this.listeners = new Set();
    this.explode = 0;
    this.idle = { enabled: true, look: new THREE.Vector2(), lookTarget: new THREE.Vector2(), strength: 1 };
    this.time = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(ev) { for (const fn of this.listeners) fn(ev, this); }

  _context(id) {
    const groups = [];
    const rig = this.rig;
    const ctx = {
      THREE,
      id,
      rig,
      anatomy,
      geo,
      materials: this.materials,
      /** Group attached to `joint`, authored in `space` coords. */
      space: (joint, space = 'head') => {
        const g = rig.space(joint, space);
        g.name = `${id}@${joint}`;
        g.userData.part = id;
        groups.push(g);
        return g;
      },
      /** Name + shadow flags + part tag for a mesh; returns the mesh. */
      mesh: (geometry, material, name) => {
        const m = new THREE.Mesh(geometry, material);
        m.name = name || id;
        m.userData.part = id;
        return m;
      },
    };
    return { ctx, groups };
  }

  /** Build one registry entry. Failures are isolated to that part. */
  async loadPart(entry, { animate = true } = {}) {
    this.status[entry.id] = 'loading';
    this._emit({ type: 'status', id: entry.id, status: 'loading' });
    const t0 = performance.now();
    try {
      const mod = await entry.load();
      const { ctx, groups } = this._context(entry.id);
      // parts are authored on the un-warped rig; FACE_WARP is applied after
      this.rig.setWarp(false);
      let inst;
      try {
        inst = mod.build(ctx) || {};
        if (inst.then) inst = (await inst) || {};
        if (!anatomy.FACE_WARP.skipParts.includes(entry.id)) this._warpPart(groups);
      } finally {
        this.rig.setWarp(anatomy.FACE_WARP.enabled);
      }
      const meta = mod.meta || {};
      const part = {
        id: entry.id,
        meta,
        groups,
        params: inst.params || {},
        paramSpec: inst.paramSpec || {},
        apply: inst.apply || (() => {}),
        update: inst.update || null,
        dispose: inst.dispose || null,
        explodeDir: new THREE.Vector3().fromArray(meta.explode || [0, 0, 0.6]),
        appear: animate ? 0 : 1,
      };
      for (const g of groups) g.userData.restPosition = g.position.clone();
      // shadows: every lit mesh casts and receives (glow / unlit pieces don't)
      for (const g of groups) {
        g.traverse((o) => {
          if (!o.isMesh) return;
          const lit = o.material && !o.material.isMeshBasicMaterial && !o.material.isShaderMaterial && o.material.toneMapped !== false;
          o.castShadow = !!lit;
          o.receiveShadow = !!lit;
        });
      }
      part.apply(part.params);
      this.parts[entry.id] = part;
      this._applyGroupOffsets(part);
      this.status[entry.id] = 'ready';
      this.timings[entry.id] = Math.round(performance.now() - t0);
      this._emit({ type: 'status', id: entry.id, status: 'ready' });
      return part;
    } catch (err) {
      console.error(`[ultron] part "${entry.id}" failed`, err);
      this.status[entry.id] = 'error';
      this._emit({ type: 'status', id: entry.id, status: 'error', error: err });
      return null;
    }
  }

  /**
   * Apply anatomy.FACE_WARP to every mesh of a freshly built part that lives
   * under the head joint. Must run while the rig is un-warped; the vertices
   * are re-expressed relative to the warped joints afterwards.
   */
  _warpPart(groups) {
    if (!anatomy.FACE_WARP.enabled) return;
    const head = this.rig.joints.head;
    const rigidJoints = new Set(anatomy.FACE_WARP.rigid.map((n) => this.rig.joints[n]));
    const isUnder = (o, target) => { for (let p = o; p; p = p.parent) if (p === target) return true; return false; };
    const rigidOf = (o) => { for (let p = o; p; p = p.parent) if (rigidJoints.has(p)) return p; return null; };
    this.rig.root.updateMatrixWorld(true);
    const headInv = head.matrixWorld.clone().invert();
    const jobs = [];
    const seen = new Set();
    for (const g of groups) {
      if (!isUnder(g, head)) continue;
      g.traverse((o) => {
        if (!o.isMesh || seen.has(o.geometry) || rigidOf(o)) return;
        seen.add(o.geometry);
        jobs.push({ mesh: o, toHead: headInv.clone().multiply(o.matrixWorld) });
      });
    }
    // re-express relative to the warped joints
    this.rig.setWarp(true);
    const P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
    for (const { mesh, toHead } of jobs) {
      const fromHead = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(mesh.matrixWorld).invert();
      const nIn = new THREE.Matrix3().getNormalMatrix(toHead);
      const nOut = new THREE.Matrix3().getNormalMatrix(fromHead);
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const morphs = geo.morphAttributes.position || [];
      const warpAttr = (attr) => {
        for (let i = 0; i < attr.count; i++) {
          P.fromBufferAttribute(attr, i).applyMatrix4(toHead);
          anatomy.warpHeadPoint(P).applyMatrix4(fromHead);
          attr.setXYZ(i, P.x, P.y, P.z);
        }
        attr.needsUpdate = true;
      };
      if (nrm) {
        for (let i = 0; i < pos.count; i++) {
          Q.fromBufferAttribute(pos, i).applyMatrix4(toHead);
          N.fromBufferAttribute(nrm, i).applyMatrix3(nIn);
          anatomy.warpHeadNormal(Q, N).applyMatrix3(nOut).normalize();
          nrm.setXYZ(i, N.x, N.y, N.z);
        }
        nrm.needsUpdate = true;
      }
      for (const m of morphs) warpAttr(m);
      for (const m of geo.morphAttributes.normal || []) {
        for (let i = 0; i < m.count; i++) {
          N.fromBufferAttribute(m, i).applyMatrix3(nIn);
          Q.fromBufferAttribute(pos, i); // approximate: use base position
          anatomy.warpHeadNormal(Q.applyMatrix4(toHead), N).applyMatrix3(nOut).normalize();
          m.setXYZ(i, N.x, N.y, N.z);
        }
      }
      warpAttr(pos);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
    }
    this.rig.setWarp(false);
  }

  /**
   * Load parts one after another.
   * @param {object} o { only: string[], stagger: ms between parts, animate }
   */
  async loadAll(o = {}) {
    const list = o.only ? PARTS.filter((p) => o.only.includes(p.id)) : PARTS;
    if (o.only) for (const p of PARTS) if (!o.only.includes(p.id)) this.status[p.id] = 'skipped';
    for (const entry of list) {
      await this.loadPart(entry, { animate: o.animate !== false });
      if (o.stagger) await new Promise((r) => setTimeout(r, o.stagger));
    }
    this._emit({ type: 'done' });
  }

  set(partId, key, value) {
    const p = this.parts[partId];
    if (!p) return;
    p.params[key] = value;
    p.apply(p.params);
  }

  setExplode(k) {
    this.explode = k;
    for (const p of Object.values(this.parts)) this._applyGroupOffsets(p);
  }

  setVisible(partId, visible) {
    const p = this.parts[partId];
    if (p) for (const g of p.groups) g.visible = visible;
  }

  isolate(partId) {
    for (const id of Object.keys(this.parts)) this.setVisible(id, !partId || id === partId);
  }

  /** x, y in -1..1 (screen space). */
  lookAt(x, y) { this.idle.lookTarget.set(x, y); }

  _applyGroupOffsets(part) {
    const a = part.appear;
    const fly = 1 - easeOutCubic(Math.min(1, a));
    const k = this.explode + fly * 2.2;
    const s = a >= 1 ? 1 : 0.85 + 0.15 * easeOutBack(Math.min(1, a));
    for (const g of part.groups) {
      g.position.copy(g.userData.restPosition).addScaledVector(part.explodeDir, k);
      // scale about the group's own origin is fine for a fly-in
      g.scale.setScalar(s);
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const p of Object.values(this.parts)) {
      if (p.appear < 1) {
        p.appear = Math.min(1, p.appear + dt / 1.1);
        this._applyGroupOffsets(p);
      }
      if (p.update) p.update(t, dt, p.params);
    }
    if (this.idle.enabled) {
      const I = this.idle;
      I.look.lerp(I.lookTarget, 1 - Math.exp(-dt * 2.5));
      const k = I.strength;
      const breathe = Math.sin(t * 0.9) * 0.012 * k;
      this.rig.pose({
        neck: { rx: breathe * 0.6 - I.look.y * 0.05 * k, ry: I.look.x * 0.12 * k + Math.sin(t * 0.23) * 0.03 * k },
        head: {
          rx: -I.look.y * 0.14 * k + Math.sin(t * 0.37) * 0.015 * k,
          ry: I.look.x * 0.22 * k + Math.sin(t * 0.19 + 1.3) * 0.04 * k,
          rz: Math.sin(t * 0.29 + 0.4) * 0.012 * k,
        },
        chest: { py: breathe * 0.5 },
      });
    }
  }

  dispose() {
    for (const p of Object.values(this.parts)) p.dispose?.();
    this.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
