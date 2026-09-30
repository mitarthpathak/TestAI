@AGENTS.md

# Ultron face — project rules

A textless Next.js landing page that renders a procedural, rigged, animatable
3D Ultron bust (crown -> collarbones) with three.js. Reference images live in
`reference/` (`ultron-front.png`, `ultron-threequarter.webp`).

## Layout

```
app/                    Next.js App Router shell (page renders <UltronStage/>)
components/UltronStage  client component: canvas + textless part-loading rail
src/ultron/             SHARED CORE (lead/integrator owns these files)
  anatomy.js            coordinate contract: joints, landmarks, head profile, cutouts, views
  geometry.js           helpers: shellPatch, conformPlate, ringStack, sweptSection, carve, ...
  materials.js          MaterialLibrary: chrome / gunmetal / darkMetal / cavity / eyeGlow / ...
  environment.js        studio env map + lights
  rig.js                joint hierarchy (root>chest>neck>head>{jaw,eyes,brows,cheeks,fins,lips})
  Ultron.js             loads parts one by one, animation API (set, pose, explode, isolate)
  stage.js              renderer, OrbitControls, postprocessing bloom, lil-gui (?debug)
  registry.js           part load order
src/parts/<part>.js     ONE FILE PER FACE COMPONENT (each owned by one session)
scripts/snap.mjs        Playwright capture (front / threequarter / side)
scripts/compare.mjs     side-by-side sheet: reference vs render
```

## Parallel-session rules (important)

- Every part session works in its OWN git worktree/branch and edits ONLY the
  part file(s) it was assigned in `src/parts/`. Never touch `src/ultron/*`,
  `app/*`, `components/*`, `scripts/*`, `package.json`, or another part's file.
- Need a shared change (new landmark, helper, material, cutout)? Implement a
  local version inside your part file and mention the request in your final
  report; the integrator promotes it into the core.
- Do not add npm dependencies.
- Commit only your part file(s). Never commit `screenshots/`, `.next/`, `node_modules/`.

## Part module contract

```js
export const meta = { id: 'jaw', explode: [x, y, z] }; // explode = fly-in direction
export function build(ctx) {
  const root = ctx.space('jaw', 'head');  // Group on a rig joint; author in HEAD space
  // ctx.space(joint, 'body' | 'head' | 'local')
  // ctx.THREE, ctx.geo (geometry helpers), ctx.anatomy, ctx.rig, ctx.materials
  // ctx.mesh(geometry, material, name)
  return {
    params: { open: 0 },                            // animatable state
    paramSpec: { open: { min: 0, max: 1, step: 0.01 } }, // shows up in lil-gui
    apply(params) {},                               // push params into transforms
    update(time, dt, params) {},                    // optional per-frame idle motion
  };
}
```

- Build every sub-component as a separately named mesh/group (e.g.
  `jaw.chin`, `jaw.mandible.L`) so it can be animated later. Anything that
  should move (lids, brows, lip corners, disc grilles, fin flare) needs its
  own pivot Group placed at a sensible hinge point.
- Coordinates: +Y up, +Z forward (face looks at +Z), +X = model's LEFT.
- Use `anatomy.headSurface/headNormal/headFrontZ` and `LANDMARKS` to stay on
  the shared skull surface. Use `geo.carve(geometry, ['cheekL', ...])` to keep
  `anatomy.CUTOUTS` clear (eye sockets, cheek discs).
- Materials: `ctx.materials.get('chrome', { panel: 4, seed: 7 })` adds
  procedural panel lines (UV based; helper geometries emit ~world-unit UVs).
  `eyeGlow` is HDR and is the only thing that should trigger bloom.
- Keep total triangle count sane (whole bust < ~1.5M tris) and build time per
  part < ~1.5 s in headless Chromium.

## Run / verify

```bash
npm install
npm run dev -- -p 3000               # http://localhost:3000  (?debug for lil-gui)
node scripts/snap.mjs --port 3000 --tag mytag             # all parts, 3 views
node scripts/snap.mjs --port 3000 --tag mytag --isolate jaw  # only show one part
node scripts/snap.mjs --port 3000 --tag mytag --views closeup
node scripts/compare.mjs --tag mytag  # screenshots/mytag/compare.png
```

URL flags: `?debug`, `?capture=1`, `?view=front|threequarter|side|closeup|hero`,
`?only=a,b`, `?isolate=part`, `?explode=0.6`.
Look at the PNGs (Read tool) and compare against the references for
silhouette, proportions, plate flow, depth and glow. Iterate until it matches.
