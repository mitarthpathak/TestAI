/**
 * Rig: a hierarchy of pivot Groups built from anatomy.JOINTS.
 * OWNER: lead / integrator.
 *
 *   root -> chest -> neck -> head -> { jaw -> lipLower, eyeL, eyeR, browL, ... }
 *
 * Animating a joint (rotation / position / scale) moves every part attached
 * to it and to its children. Rest pose = all joint rotations zero.
 */
import * as THREE from 'three';
import { JOINTS } from './anatomy.js';

export class Rig {
  constructor() {
    this.joints = {};
    this.bodyPos = {};
    const headOrigin = new THREE.Vector3().fromArray(JOINTS.head.pos);
    // absolute (body-space) positions
    for (const [name, j] of Object.entries(JOINTS)) {
      const p = new THREE.Vector3().fromArray(j.pos);
      if (j.space === 'head') p.add(headOrigin);
      this.bodyPos[name] = p;
    }
    // create groups in declaration order (parents are declared first)
    for (const [name, j] of Object.entries(JOINTS)) {
      const g = new THREE.Group();
      g.name = `joint:${name}`;
      g.userData.joint = name;
      if (j.parent) {
        g.position.copy(this.bodyPos[name]).sub(this.bodyPos[j.parent]);
        this.joints[j.parent].add(g);
      } else {
        g.position.copy(this.bodyPos[name]);
      }
      g.userData.restPosition = g.position.clone();
      this.joints[name] = g;
    }
    this.root = this.joints.root;
    this.headOrigin = headOrigin;
  }

  /**
   * A Group attached to `joint` in which children can be authored in
   * `space` coordinates: 'head' | 'body' | 'local' (= the joint's own origin).
   */
  space(joint, space = 'head') {
    const target = this.joints[joint];
    if (!target) throw new Error(`Unknown joint "${joint}"`);
    const g = new THREE.Group();
    g.name = `space:${joint}:${space}`;
    if (space !== 'local') {
      const origin = space === 'head' ? this.headOrigin : new THREE.Vector3();
      g.position.copy(origin).sub(this.bodyPos[joint]);
    }
    target.add(g);
    return g;
  }

  /** Convert a HEAD/BODY space point into this joint's local space. */
  toJointLocal(joint, point, space = 'head') {
    const origin = space === 'head' ? this.headOrigin : new THREE.Vector3();
    return new THREE.Vector3().fromArray(point).add(origin).sub(this.bodyPos[joint]);
  }

  /** Apply a pose: { jointName: { rx, ry, rz, px, py, pz, s } } (radians, units). */
  pose(p) {
    for (const [name, v] of Object.entries(p)) {
      const j = this.joints[name];
      if (!j) continue;
      if (v.rx !== undefined) j.rotation.x = v.rx;
      if (v.ry !== undefined) j.rotation.y = v.ry;
      if (v.rz !== undefined) j.rotation.z = v.rz;
      const r = j.userData.restPosition;
      if (v.px !== undefined) j.position.x = r.x + v.px;
      if (v.py !== undefined) j.position.y = r.y + v.py;
      if (v.pz !== undefined) j.position.z = r.z + v.pz;
      if (v.s !== undefined) j.scale.setScalar(v.s);
    }
  }

  reset() {
    for (const j of Object.values(this.joints)) {
      j.rotation.set(0, 0, 0);
      j.position.copy(j.userData.restPosition);
      j.scale.setScalar(1);
    }
  }
}
