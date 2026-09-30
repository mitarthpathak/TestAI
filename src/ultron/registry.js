/**
 * Load order of every part. Each entry is code-split (dynamic import) so the
 * page can stream the face in part by part.
 * OWNER: lead / integrator.
 */
export const PARTS = [
  { id: 'collar',    load: () => import('../parts/collar.js') },
  { id: 'neck',      load: () => import('../parts/neck.js') },
  { id: 'cranium',   load: () => import('../parts/cranium.js') },
  { id: 'faceplate', load: () => import('../parts/faceplate.js') },
  { id: 'cheeks',    load: () => import('../parts/cheeks.js') },
  { id: 'jaw',       load: () => import('../parts/jaw.js') },
  { id: 'lips',      load: () => import('../parts/lips.js') },
  { id: 'fins',      load: () => import('../parts/fins.js') },
  { id: 'eyes',      load: () => import('../parts/eyes.js') },
];

export const PART_IDS = PARTS.map((p) => p.id);
