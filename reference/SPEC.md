# Ultron bust — target spec (read before touching a part)

Targets, in priority order: `ultron-film-front.png`, `ultron-film-34.png` (the
film frames), `ultron-threequarter.webp` (ILM concept, best detail),
`ultron-front.png` (best orthographic proportions), `ultron-poster-34.png`.

## Proportions (already encoded in `src/ultron/anatomy.js`)

E = eye spacing = 0.67 head units. All HEAD space, +X = model's left.

| feature | where |
|---|---|
| crown top | y 1.96, 1.55E above the eyes |
| eyes (iris centres) | (±0.335, 0.93, 0.645), deep under the brow, outer corner raised |
| widest skull | half-width 0.75 at eye level; dome narrows to 0.61 @ y1.56, 0.37 @ y1.84 (egg, NOT a mushroom) |
| nose plate bottom | (0, 0.5, 0.9) |
| mouth slit | y 0.24, z ~0.88, half-width 0.25 — 1.0E below the eyes, on a forward muzzle |
| chin button | (0, -0.14, 0.76) round disc on the front-bottom of the chin |
| chin bottom | y -0.32 (long chin) |
| cheek turbine hub | (±0.47, 0.46, 0.55), faces mostly sideways: normal (±0.85, -0.06, 0.52); cavity r 0.26, rim rings to ~0.42 |
| fins | stand-off C-blades, outer edge x ±1.08 at y ~0.72, root on the upper cranium side (±0.64, 1.6, -0.12), hook tip (±0.64, 0.17, 0.6) pointing inward at mouth-corner level |
| neck | body space, head joint at (0, 1.3, -0.05); visible neck from chin (body y ~1.0) to collar (~0.35) |

Camera presets `front`, `filmfront`, `threequarter`, `film34` were solved
against the matching reference's landmarks AND use long lenses like the
reference stills (`fov` per view), so a render in that view should overlay
its reference once the eyes are aligned. (With the old 28deg lens the dome
looked ~25% too low in front view — that was perspective, not shape.)

## Verify loop (do this every iteration)

```bash
node scripts/snap.mjs --port $PORT --tag $TAG --views front,filmfront,threequarter,film34
node scripts/overlay.mjs --tag $TAG                       # all 4 refs, eye-aligned
node scripts/overlay.mjs --tag $TAG --only filmfront --height 800 --out ov-ff.png
node scripts/snap.mjs --port $PORT --tag $TAG-iso --isolate <part> --views front,side,threequarter
node scripts/grid.mjs reference/ultron-threequarter.webp /tmp/x.png 2 400 300 700 600 10   # measure a detail
```

Overlay columns: reference | render aligned by eyes | 50% blend | edges
(cyan = reference, red = render). Red crosses = where the render puts the
cheek hubs and the jaw joint. Read the PNGs, write down the 3 biggest
mismatches in YOUR region, fix them, repeat. Compare silhouette first, then
plate layout, then depth / bevels, then surface detail.

Faster iterations: `--width 600 --height 734` and `--views filmfront,front`.

## Region ownership (who builds what — neighbours must meet with no gaps)

| part | owns |
|---|---|
| `cranium` | all skull above the brow line (front y > ~1.15), the whole top/back/sides of the head down to the neck, temples, occiput, the central forehead crest, and the side-of-head plates BEHIND the cheek rings (z < ~0.15). Fin root sockets on the upper sides. |
| `faceplate` | front of the face between brow and upper lip: heavy brow ridge, socket frames around the eyes, long flat nose plate (+ crest join at the top), under-eye / cheekbone plates down to the inner edge of the cheek rings, the nasal "W" step above the mouth. |
| `eyes` | everything inside the sockets: dark socket cavity, iris glow (red HDR, bright core + ring), lids/shutters with pivots, socket inner rim. |
| `cheeks` | the turbine discs (recessed cavity, concentric stepped rings, radial vanes, hub) AND the thick C-shaped "jowl" bands that wrap each disc: from under the outer eye corner, over the top and around the back of the disc, down and forward under it to the mouth corner (the C opens toward the nose). |
| `fins` | the two stand-off horn blades with forward hooks + their attachment brackets. |
| `jaw` | the muzzle below the upper lip: lower-lip carrier, the long rounded chin, chin button, jaw sides from the mouth corners back under the cheek rings, under-jaw surfaces meeting the neck. |
| `lips` | upper + lower lip plates around the mouth slit (thick, rounded, stern), lip corners; hinged on lipUpper / lipLower. |
| `neck` | body y ~0.3 up into the underside of the head: segmented central throat column, thick vertical side bands from behind the jaw (SCM-like), back-of-neck vertebra plates, cables / pistons between. |
| `collar` | trapezius plates sloping from the neck out and down to big rounded shoulder armour, clavicle bars, upper chest plates with the central sternum notch. |

## Look

- Material = film gunmetal/steel: mid-grey metal with cool blue reflections,
  bright polished bevels on plate edges, dense thin panel lines; never flat
  black, never mirror chrome. Use `chrome`/`gunmetal` for plates, `darkMetal`
  only for recessed/inner layers, `cavity` only inside holes.
- Plates overlap in LAYERS (thickness + bevel + small gap/shadow line between
  plates). Every plate is a separate named mesh.
- Glow: only the eyes (and a faint red hub/seam accent is allowed in the
  cheek turbine and forehead seams, see poster). `eyeGlow` is the only bloom
  source.
- Budget: whole bust < 1.5M tris; each part builds < 1.5 s headless.
