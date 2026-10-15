import type { NeuralSnapshot } from '../../core/types';
import map from '@brain-map';
import './brain-view.css';
import { BrainScene } from './brain-scene';

const count = new Intl.NumberFormat('es');
const groups = map.groups.filter((group) => group.neurons > 0);
/** Lectura acotada de telemetría propia: no crea cerebros, sesiones ni tráfico de red. */
export class BrainView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events = new AbortController();
  private intersection: IntersectionObserver;
  private resize: ResizeObserver;
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight = false;
  private inView = false;
  private disposed = false;
  private snapshot?: NeuralSnapshot;
  private lastTickAt = 0;
  private scene = new BrainScene();
  private animation?: number;
  private frameAt = 0;
  private phase = 0;
  private drag?: { x: number; y: number; moved: boolean };
  private manualRotation = false;
  private history: number[] = [];
  private generation = 0;
  constructor(private panel: HTMLDetailsElement, private read: () => Promise<NeuralSnapshot | undefined>) {
    this.canvas = this.element<HTMLCanvasElement>('brain-canvas');
    this.ctx = this.canvas.getContext('2d')!;
    const options = { signal: this.events.signal };
    this.canvas.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, moved: false };
      this.canvas.setPointerCapture(event.pointerId);
    }, options);
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      if (this.drag.moved) {
        this.manualRotation = true;
        this.scene.rotate(dx * .008, dy * .006);
        this.render();
      }
      this.drag.x = event.clientX; this.drag.y = event.clientY;
    }, options);
    const endDrag = () => { this.drag = undefined; };
    this.canvas.addEventListener('pointerup', endDrag, options);
    this.canvas.addEventListener('pointercancel', endDrag, options);
    this.canvas.addEventListener('lostpointercapture', endDrag, options);
    this.element('brain-left').addEventListener('click', () => { this.manualRotation = true; this.scene.rotate(-.3); this.render(); }, options);
    this.element('brain-right').addEventListener('click', () => { this.manualRotation = true; this.scene.rotate(.3); this.render(); }, options);
    this.element('brain-reset').addEventListener('click', () => { this.manualRotation = false; this.scene.reset(); this.render(); }, options);
    this.panel.addEventListener('toggle', () => this.schedule(), options);
    document.addEventListener('visibilitychange', () => this.schedule(), options);
    this.motion.addEventListener('change', () => this.schedule(), options);
    this.intersection = new IntersectionObserver(([entry]) => { this.inView = entry.isIntersecting; this.schedule(); });
    this.intersection.observe(this.canvas);
    this.resize = new ResizeObserver(() => { if (this.visible()) this.render(); });
    this.resize.observe(this.canvas);
    this.element('brain-model').textContent = `${count.format(map.neurons)} neuronas · ${count.format(map.edges)} conexiones locales.`;
    this.render();
  }
  private element<T extends HTMLElement = HTMLElement>(id: string) { return this.panel.querySelector<T>(`#${id}`)!; }
  private visible() { return !this.disposed && this.panel.open && this.inView && !document.hidden; }
  private schedule() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.animation ?? 0);
    this.animation = undefined;
    this.frameAt = 0;
    if (!this.visible()) {
      this.generation++;
      this.snapshot = undefined;
      this.history = [];
      this.render();
      return;
    }
    if (!this.motion.matches) this.animation = requestAnimationFrame((time) => this.animate(time));
    if (!this.inFlight) void this.poll();
  }
  private animate(time: number) {
    if (!this.visible() || this.motion.matches) return;
    if (time - this.frameAt >= 1000 / 30) {
      const elapsed = this.frameAt ? Math.min(.1, (time - this.frameAt) / 1000) : 0;
      this.frameAt = time;
      if (this.snapshot && this.snapshot.tick > 0 && performance.now() - this.lastTickAt <= 2000) {
        this.phase += elapsed;
        if (!this.manualRotation && !this.drag) this.scene.yaw = .34 + Math.sin(this.phase * .22) * .24;
        this.draw(this.snapshot);
      }
    }
    this.animation = requestAnimationFrame((next) => this.animate(next));
  }
  private async poll() {
    if (!this.visible() || this.inFlight) return;
    this.inFlight = true;
    const generation = this.generation;
    try {
      const next = await this.read();
      if (generation !== this.generation || !this.visible()) return;
      if (!next || next.session !== this.snapshot?.session || next.tick < (this.snapshot?.tick ?? 0)) this.history = [];
      if (next && (next.session !== this.snapshot?.session || next.tick !== this.snapshot?.tick)) {
        this.lastTickAt = performance.now();
        this.history.push(next.fired);
        if (this.history.length > 50) this.history.shift();
      }
      this.snapshot = next;
      this.render();
    } catch {
      this.snapshot = undefined;
      this.history = [];
      this.render();
    } finally {
      this.inFlight = false;
      if (this.visible()) this.timer = setTimeout(() => void this.poll(), this.motion.matches ? 1000 : 100);
    }
  }
  private render() {
    if (this.disposed) return;
    const data = this.snapshot;
    const stale = Boolean(data) && performance.now() - this.lastTickAt > 2000;
    const live = data && !stale && data.tick > 0;
    const active = live ? groups.filter((group) => (data.groups[group.id] ?? 0) > 0 || data.groupActive?.[group.id]).length : 0;
    this.element('brain-state').textContent = !this.visible() ? 'Vista en pausa' : live ? 'En vivo' : stale ? 'Sin señal reciente' : 'Sin actividad local';
    this.element('brain-state').dataset.live = String(Boolean(live));
    this.element('brain-fired').textContent = live ? count.format(data.fired) : '—';
    this.element('brain-active').textContent = live ? String(active) : '—';
    this.element('brain-tick').textContent = live ? count.format(data.tick) : '—';
    const output = (value: number) => `${Math.round(value * 100)}%`;
    this.element('brain-forward').textContent = `Avance: ${live ? output(data.motor.forward) : '—'}`;
    this.element('brain-turn').textContent = `Giro: ${live ? output(data.motor.turn) : '—'}`;
    this.element('brain-feed').textContent = `Alimentación: ${live ? output(data.motor.feed) : '—'}`;
    this.element('brain-note').textContent = !this.visible() ? 'Solo se pausa la vista. El cerebro conserva su estado.' : live ? 'Actividad del cerebro de tu mosca, calculada en este equipo.' : stale ? 'El worker no ha enviado un tick nuevo. El esquema permanece en reposo.' : 'Conecta tu mosca para ver su actividad. Abrir esta vista no inicia una sesión.';
    this.canvas.setAttribute('aria-label', `Cerebro esquemático en tres dimensiones. ${live ? `${active} grupos activos, ${data.fired} disparos en el último tick.` : 'Sin actividad local reciente.'}`);
    if (this.visible()) this.draw(live ? data : undefined);
  }
  private draw(data?: NeuralSnapshot) {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    this.scene.draw(ctx, width, height, data, this.phase, !this.motion.matches);
    if (data && this.history.length > 1) {
      const maximum = Math.max(1, ...this.history);
      ctx.strokeStyle = '#a4ce9f'; ctx.lineWidth = 1.2; ctx.beginPath();
      this.history.forEach((value, index) => { const x = 12 + index / 49 * (width - 24), y = height - 6 - value / maximum * 18; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }
  dispose() {
    this.disposed = true; this.generation++; clearTimeout(this.timer); cancelAnimationFrame(this.animation ?? 0);
    this.events.abort(); this.intersection.disconnect(); this.resize.disconnect();
  }
}
