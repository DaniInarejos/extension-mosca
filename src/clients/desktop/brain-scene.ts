import map from '@brain-map';
import type { NeuralSnapshot } from '../../core/types';

type Point = { x: number; y: number; z: number };
type Node = Point & { group: number };
const groups = map.groups.filter((group) => group.neurons > 0);

// Superficie ilustrada: dos hemisferios plegados, no coordenadas anatómicas FlyWire.
function surface(side: number, latitude: number, longitude: number): Point {
  const ring = Math.sin(latitude);
  const fold = 1 + .035 * Math.cos(longitude * 11 + Math.sin(latitude * 5) * 2);
  return {
    x: side * (.055 + ring * (.47 + .45 * Math.cos(longitude)) * fold),
    y: -.82 * Math.cos(latitude) * (1 + .025 * Math.sin(longitude * 8)),
    z: .62 * ring * Math.sin(longitude) * fold,
  };
}

/** Nube espacial acotada. La actividad pertenece a grupos; los puntos son representantes. */
export class BrainScene {
  yaw = .34;
  pitch = -.18;
  private nodes: Node[] = [];
  private folds: Point[][] = [];
  private links: [number, number][] = [];
  private projected: Point[] = [];
  private order: number[] = [];

  constructor() {
    const byGroup = new Map<number, number[]>();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 640; i++) {
        const point = surface(side, Math.acos(1 - 2 * (i + .5) / 640), i * 2.39996323);
        const region = point.y > .4 ? 'motor' : Math.abs(point.x) > .62 ? 'sensory' : point.y > .2 ? 'drives' : 'central';
        const peers = groups.filter((group) => group.region === region);
        const group = (peers.length ? peers : groups)[i % (peers.length || groups.length)].id;
        const indices = byGroup.get(group) ?? [];
        indices.push(this.nodes.length); byGroup.set(group, indices);
        this.nodes.push({ ...point, group });
      }
      for (let fold = 0; fold < 10; fold++) {
        this.folds.push(Array.from({ length: 65 }, (_, i) => {
          const latitude = .06 + i / 64 * (Math.PI - .12);
          return surface(side, latitude, fold * Math.PI / 5 + .16 * Math.sin(latitude * 6 + fold));
        }));
      }
    }
    // Cada trayecto visual une grupos conectados en el grafo local; su curva es ilustrativa.
    for (const link of map.links) {
      const from = byGroup.get(link.source), to = byGroup.get(link.target);
      if (!from || !to) continue;
      for (let i = 0; i < 3; i++) this.links.push([from[(link.target * 7 + i * 13) % from.length], to[(link.source * 11 + i * 17) % to.length]]);
    }
    this.projected = this.nodes.map(() => ({ x: 0, y: 0, z: 0 }));
    this.order = this.nodes.map((_, index) => index);
  }

  rotate(horizontal: number, vertical = 0) {
    this.yaw += horizontal;
    this.pitch = Math.max(-.8, Math.min(.8, this.pitch + vertical));
  }
  reset() { this.yaw = .34; this.pitch = -.18; }
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, data: NeuralSnapshot | undefined, phase: number, motion: boolean) {
    const scale = Math.min(width * .45, height * .43);
    const project = (point: Point): Point => {
      const x = point.x * Math.cos(this.yaw) + point.z * Math.sin(this.yaw);
      const z = point.z * Math.cos(this.yaw) - point.x * Math.sin(this.yaw);
      const depth = point.y * Math.sin(this.pitch) + z * Math.cos(this.pitch);
      const perspective = 4 / (4 - depth);
      return { x: width / 2 + x * scale * perspective, y: height * .47 + (point.y * Math.cos(this.pitch) - z * Math.sin(this.pitch)) * scale * perspective, z: depth };
    };
    this.nodes.forEach((node, index) => { this.projected[index] = project(node); });
    this.order.sort((a, b) => this.projected[a].z - this.projected[b].z);
    ctx.lineWidth = .6;
    for (const fold of this.folds) {
      const points = fold.map(project);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        ctx.strokeStyle = b.z > 0 ? '#a9c9b13d' : '#a9c9b111';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (let index = 0; index < this.links.length; index++) {
      const [source, target] = this.links[index];
      const a = this.projected[source], b = this.projected[target];
      const group = this.nodes[source].group;
      const firing = (data?.groups[group] ?? 0) > 0;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 9;
      ctx.strokeStyle = firing ? '#a4ddb52c' : '#b3d6bc0b';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
      if (firing && motion && index % 3 === 0) {
        const t = (phase * .45 + index * .618) % 1, u = 1 - t;
        ctx.fillStyle = '#ddf5ba9c'; ctx.beginPath();
        ctx.arc(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const index of this.order) {
      const node = this.nodes[index], point = this.projected[index];
      const firing = (data?.groups[node.group] ?? 0) > 0;
      const processing = data?.groupActive?.[node.group];
      const front = Math.max(.2, Math.min(1, (point.z + .75) / 1.5));
      ctx.globalAlpha = .22 + front * .6;
      if (firing) {
        ctx.fillStyle = '#b4eaa61c'; ctx.beginPath(); ctx.arc(point.x, point.y, 3 + front * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = firing ? '#c6f4ae' : processing ? '#e2b66e' : '#729784';
      ctx.beginPath(); ctx.arc(point.x, point.y, .5 + front * .55 + (firing ? .4 : 0), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
