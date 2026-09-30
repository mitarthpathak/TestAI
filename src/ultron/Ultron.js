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
    try {
      const mod = await entry.load();
      const { ctx, groups } = this._context(entry.id);
      const inst = (await mod.build(ctx)) || {};
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
      part.apply(part.params);
      this.parts[entry.id] = part;
      this._applyGroupOffsets(part);
      this.status[entry.id] = 'ready';
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
