import type { Vec3, WorldObject } from '../protocol/index';
/** The square simulation fits inside the circular miniature rendered by the client. */
export const BOUNDS = { min: -26, max: 26, floor: 0.25, ceiling: 7 };
export const GARDEN_RADIUS = Math.ceil(Math.SQRT2 * BOUNDS.max) + 0.5;
export const MAX_SPEED = 3;
export const MAX_ACCELERATION = 9;
export const BODY_RADIUS = 0.2;
/** Visual overlap, intentionally not a physical collider. */
export const FLY_OVERLAP_DISTANCE = 0.68;
export const FLY_OVERLAP_HEIGHT = 0.4;
export const FLY_MAX_OVERLAP_MS = 20_000;
const SKIN = 0.0001;
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flowerBeds: [number, number, string][] = [
  [-17, 15, '#efd497'],
  [-13, 19, '#d58da5'],
  [-20, 10, '#b9c9ed'],
  [-10, 11, '#f0c6a2'],
  [7, 12, '#d7b6e7'],
  [13, 9, '#efd497'],
  [8, -16, '#b9c9ed'],
  [-4, -15, '#d58da5'],
  [-17, -7, '#efd497'],
];

const branchPositions: [number, number][] = [
  [-22, 18],
  [22, -19],
  [-21, -19],
  [21, 5],
];

export const objects: WorldObject[] = [
  {
    id: 'garden-pond',
    type: 'water',
    name: 'Estanque de los nenúfares',
    position: [10, 0, 11],
    radius: 2.6,
  },
  {
    id: 'wetland-pool',
    type: 'water',
    name: 'Charca del tronco hueco',
    position: [-14.5, 0, -12],
    radius: 1.35,
  },
  ...branchPositions.map(([x, z], i) => ({
    id: `trunk-branch-${i}`,
    type: 'trunk' as const,
    name: 'Tronco de la rama',
    position: [x, 0, z] as Vec3,
    radius: 0.13,
    height: 2.4,
  })),
  {
    id: 'apple',
    type: 'food',
    name: 'Manzana caída',
    position: [-5, 0.3, 4],
    radius: 0.9,
    amount: 500,
  },
  {
    id: 'pear',
    type: 'food',
    name: 'Pera madura',
    position: [8, 0.3, -5],
    radius: 0.85,
    amount: 500,
  },
  {
    id: 'berry',
    type: 'food',
    name: 'Bayas silvestres',
    position: [-8, 0.3, -7],
    radius: 0.75,
    amount: 500,
  },
  ...flowerBeds.map(([x, z, color], i) => ({
    id: `flower-${i}`,
    type: 'flower' as const,
    name: 'Flores del jardín',
    position: [x, 0, z] as Vec3,
    radius: 1.45,
    color,
  })),
  ...[
    [3, -3, 1.4],
    [-5, 13, 0.8],
    [16, -15, 1.75],
    [-17, -5, 1.2],
    [21, -11, 0.75],
  ].map(([x, z, r], i) => ({
    id: `rock-${i}`,
    type: 'rock' as const,
    name: i === 2 ? 'Piedra cálida' : 'Piedra',
    position: [x, r * 0.45, z] as Vec3,
    radius: r,
  })),
  { id: 'north', type: 'zone', name: 'Pradera del viento', position: [0, 0, -18], radius: 7 },
  { id: 'south', type: 'zone', name: 'Prado florido', position: [-15, 0, 15], radius: 8.5 },
  { id: 'wetland', type: 'zone', name: 'Humedal de los juncos', position: [15, 0, 13], radius: 8 },
  { id: 'grove', type: 'zone', name: 'Arboleda umbría', position: [-17, 0, -16], radius: 8 },
  {
    id: 'stone-clearing',
    type: 'zone',
    name: 'Claro de la piedra cálida',
    position: [17, 0, -15],
    radius: 7.5,
  },
  {
    id: 'sand-garden',
    type: 'zone',
    name: 'Playa dorada',
    position: [24, 0, 3],
    radius: 8,
  },
  {
    id: 'leaf-litter',
    type: 'zone',
    name: 'Rincón de la hojarasca',
    position: [-9, 0, -20],
    radius: 4.5,
  },
  {
    id: 'landmark-hollow-log',
    type: 'trunk',
    name: 'Tronco hueco',
    position: [-18, 0, -14],
    radius: 1.25,
    height: 0.9,
  },
  ...Array.from({ length: 34 }, (_, i) => {
    const angle = (i / 34) * Math.PI * 2;
    const ring = 31.5 + (i % 3) * 0.65;
    return {
      id: `bush-${i}`,
      type: 'bush' as const,
      name: 'Arbusto',
      position: [Math.cos(angle) * ring, 0, Math.sin(angle) * ring] as Vec3,
      radius: 1.1 + (i % 4) * 0.3,
    };
  }),
  ...[
    [-20, -17, 1.7],
    [-15, -20, 1.5],
    [-12, -14, 1.35],
    [-20, -9, 1.55],
    [19, 14, 1.2],
    [21, 18, 1.35],
    [14, 19, 1.15],
  ].map(([x, z, radius], i) => ({
    id: `habitat-bush-${i}`,
    type: 'bush' as const,
    name: i < 4 ? 'Arbusto de la arboleda' : 'Arbusto del humedal',
    position: [x, 0, z] as Vec3,
    radius,
  })),
  ...flowerBeds.map(([x, z, color], i) => ({
    id: `perch-flower-${i}`,
    type: 'perch' as const,
    name: 'una flor',
    position: [x, 0.95, z] as Vec3,
    radius: 0.3,
    color,
  })),
  ...branchPositions.map(([x, z], i) => ({
    id: `perch-branch-${i}`,
    type: 'perch' as const,
    name: 'una rama',
    position: [x, 2.4, z] as Vec3,
    radius: 0.65,
    color: '#7b6e4d',
  })),
  {
    id: 'perch-hollow-log',
    type: 'perch',
    name: 'el tronco hueco',
    position: [-18, 1.15, -14],
    radius: 1.05,
    color: '#806949',
  },
  ...[
    [-6.8, 5.4, 0.7],
    [6.3, -6.5, 0.85],
    [-6.3, -8.5, 0.65],
    [4.8, 5.5, 0.55],
    [-4.5, -1.5, 1.1],
    [8.5, 4, 0.8],
    [-9.5, 1, 0.6],
    [0, -8, 1.25],
    [-2, 12, 0.7],
    [12, -3, 0.95],
    [-20, 15, 0.85],
    [-14, 18, 0.72],
    [18, 17, 0.9],
    [21, 11, 0.68],
    [-17, -18, 0.82],
    [15, -17, 0.78],
  ].map(([x, z, y], i) => ({
    id: `perch-leaf-${i}`,
    type: 'perch' as const,
    name: 'una hoja',
    position: [x, y, z] as Vec3,
    radius: 0.65,
    color: ['#8fa975', '#a1b57d', '#7f9e6c'][i % 3],
  })),
];
/** Conservative ground footprints shared by rendering, body physics and authority. */
export function foodScale(food: WorldObject) {
  const fraction = Math.max(0, Math.min(1, (food.amount ?? 0) / (food.initialAmount ?? 500)));
  return Math.max(0.2, Math.cbrt(fraction));
}
export function solidRadius(o: WorldObject, height: number): number {
  const c = collider(o);
  return c && height > c.bottom && height < c.top - 1e-7 ? c.radius : 0;
}
/** Upright collision proxies with walkable caps. Perches are thin elevated surfaces. */
export function collider(o: WorldObject) {
  let radius = o.radius,
    top: number,
    bottom = -1;
  if (o.type === 'food') {
    const scale = foodScale(o);
    radius *= scale;
    top = o.position[1] + radius * 0.82;
  } else if (o.type === 'rock') top = o.position[1] - 0.1 + radius * 0.65;
  else if (o.type === 'bush') top = o.position[1] + radius;
  else if (o.type === 'perch') {
    top = o.position[1];
    bottom = top - 0.12 - BODY_RADIUS;
  } else if (o.type === 'trunk') top = o.position[1] + (o.height ?? 2.4);
  else return null;
  return { radius: radius + BODY_RADIUS, bottom, top: top + BOUNDS.floor };
}
export function supportAt(position: Vec3, worldObjects: WorldObject[]) {
  let height = BOUNDS.floor,
    id = 'ground';
  for (const o of worldObjects) {
    const c = collider(o);
    if (!c) continue;
    const top = c.top;
    if (
      Math.hypot(position[0] - o.position[0], position[2] - o.position[2]) < c.radius &&
      top <= position[1] + 0.025 &&
      top > height
    ) {
      height = top;
      id = o.id;
    }
  }
  return { height, id };
}
const clamp = (position: Vec3): Vec3 => [
  Math.max(BOUNDS.min, Math.min(BOUNDS.max, position[0])),
  Math.max(BOUNDS.floor, Math.min(BOUNDS.ceiling, position[1])),
  Math.max(BOUNDS.min, Math.min(BOUNDS.max, position[2])),
];
export function collides(position: Vec3, worldObjects: WorldObject[], tolerance = 0) {
  return worldObjects.some((o) => {
    const r = solidRadius(o, position[1]);
    return (
      r > 0 && Math.hypot(position[0] - o.position[0], position[2] - o.position[2]) < r - tolerance
    );
  });
}
/** Recover saved/spawned bodies inside solids; this is a physical correction, not a motor command. */
export function recoverPosition(position: Vec3, worldObjects: WorldObject[]): Vec3 {
  let p = clamp(position);
  for (let pass = 0; pass < 32; pass++) {
    if (!collides(p, worldObjects)) return p;
    for (const o of worldObjects) {
      const r = solidRadius(o, p[1]);
      const x = p[0] - o.position[0],
        z = p[2] - o.position[2],
        d = Math.hypot(x, z);
      if (!r || d >= r) continue;
      // Deterministic center escape; push boundary shrubs towards the garden.
      const nx = d > 1e-8 ? x / d : o.position[0] > 0 ? -1 : 1;
      const nz = d > 1e-8 ? z / d : 0;
      p = clamp([o.position[0] + nx * (r + SKIN), p[1], o.position[2] + nz * (r + SKIN)]);
    }
  }
  // Overlapping objects and the boundary can defeat successive projections.
  // Pick the nearest free point in deterministic expanding rings.
  for (let radius = 0.1; radius <= 52; radius += 0.1)
    for (let i = 0; i < 64; i++) {
      const angle = (i * Math.PI) / 32;
      const candidate = clamp([
        position[0] + Math.cos(angle) * radius,
        p[1],
        position[2] + Math.sin(angle) * radius,
      ]);
      if (!collides(candidate, worldObjects)) return candidate;
    }
  throw new Error('El jardín no tiene una posición libre para la mosca.');
}

/** Continuous 3D cylinder sweep, including vertical entry onto landing surfaces. */
function firstHit(from: Vec3, to: Vec3, worldObjects: WorldObject[], tolerance = 0) {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    dz = to[2] - from[2],
    a = dx * dx + dz * dz;
  let hit: { t: number; normal: Vec3 } | undefined;
  for (const o of worldObjects) {
    const cylinder = collider(o);
    if (!cylinder) continue;
    const r = cylinder.radius - tolerance,
      x = from[0] - o.position[0],
      z = from[2] - o.position[2];
    let h0 = -Infinity,
      h1 = Infinity,
      v0 = -Infinity,
      v1 = Infinity;
    if (a < 1e-16) {
      if (x * x + z * z >= r * r) continue;
    } else {
      const b = x * dx + z * dz,
        c = x * x + z * z - r * r,
        disc = b * b - a * c;
      if (disc <= 0) continue;
      h0 = (-b - Math.sqrt(disc)) / a;
      h1 = (-b + Math.sqrt(disc)) / a;
    }
    const bottom = cylinder.bottom + tolerance,
      top = cylinder.top - tolerance;
    if (Math.abs(dy) < 1e-12) {
      if (from[1] <= bottom || from[1] >= top - 1e-7) continue;
    } else {
      const t0 = (bottom - from[1]) / dy,
        t1 = (top - from[1]) / dy;
      v0 = Math.min(t0, t1);
      v1 = Math.max(t0, t1);
    }
    const enter = Math.max(h0, v0),
      leave = Math.min(h1, v1);
    if (enter > leave || leave <= 1e-8 || enter > 1 || enter < -1e-6) continue;
    const t = Math.max(0, enter);
    if (hit && t >= hit.t) continue;
    let normal: Vec3;
    if (v0 > h0) normal = [0, dy < 0 ? 1 : -1, 0];
    else {
      const hx = x + dx * t,
        hz = z + dz * t,
        length = Math.hypot(hx, hz);
      normal = [hx / length, 0, hz / length];
    }
    hit = { t, normal };
  }
  return hit;
}
export function pathCollides(from: Vec3, to: Vec3, worldObjects: WorldObject[], tolerance = 0) {
  return collides(to, worldObjects, tolerance) || !!firstHit(from, to, worldObjects, tolerance);
}
export function constrain(position: Vec3, previous: Vec3, worldObjects: WorldObject[]): Vec3 {
  let p = recoverPosition(previous, worldObjects);
  const target = clamp(position);
  let displacement = target.map((v, i) => v - previous[i]) as Vec3;
  for (let pass = 0; pass < 6; pass++) {
    const end = clamp(p.map((v, i) => v + displacement[i]) as Vec3);
    const hit = firstHit(p, end, worldObjects);
    if (!hit) return recoverPosition(end, worldObjects);
    const t = Math.max(0, hit.t - SKIN / Math.max(Math.hypot(...displacement), SKIN));
    p = p.map((v, i) => v + displacement[i] * t) as Vec3;
    displacement = displacement.map((v) => v * (1 - t)) as Vec3;
    const inward = Math.min(
      0,
      displacement.reduce((sum, v, i) => sum + v * hit.normal[i], 0),
    );
    displacement = displacement.map((v, i) => v - inward * hit.normal[i]) as Vec3;
    if (Math.hypot(...displacement) < SKIN) break;
  }
  return recoverPosition(p, worldObjects);
}
