import type { RunnerConfig, RunnerStatus } from '../../core/types';
import type { MoskaRunner } from '../../core/runner';
import { SERVICE_URL } from './contracts';
import { DesktopStore, type Settings } from './store';

type Runner = Pick<MoskaRunner, 'start' | 'startWhenAvailable' | 'stop' | 'snapshot'>;

/** Una sola autoridad de activación: menú, IPC y energía pasan por este controlador. */
export class DesktopController {
  settings: Settings = { enabled: false };
  status: RunnerStatus = { state: 'idle', detail: 'Introduce tu token para vincular la mosca.', updatedAt: Date.now() };
  private suspended = false;
  private quitting = false;
  private recovery?: ReturnType<typeof setTimeout>;
  constructor(private store: DesktopStore, private runner: Runner, private changed: () => void = () => {}) {}

  restore() {
    try {
      this.settings = this.store.read();
      if (this.settings.enabled) this.activate();
      else if (this.settings.encryptedToken) this.status = { state: 'idle', detail: 'Sesión cerrada. El token está guardado; puedes volver a conectar.', updatedAt: Date.now() };
    } catch (error) { this.fail(error); }
    this.changed();
  }
  saveToken(token: string) {
    if (this.quitting || this.settings.enabled) throw new Error('Desconecta antes de cambiar el token.');
    const next = { ...this.settings, encryptedToken: this.store.seal(token.trim()), enabled: false };
    this.store.write(next);
    this.settings = next;
    this.status = { state: 'idle', detail: 'Token guardado. Pulsa Conectar para iniciar el cerebro.', updatedAt: Date.now() };
    this.changed();
  }
  start(token?: string) {
    if (this.quitting) return;
    // Validar y cifrar antes de sustituir una configuración funcional.
    const next = { ...this.settings, enabled: true };
    if (token) next.encryptedToken = this.store.seal(token.trim());
    const config = { serverUrl: SERVICE_URL, token: this.store.unseal(next) };
    this.store.write(next);
    this.settings = next;
    this.clearRecovery();
    if (!this.suspended) void this.runner.start(config);
    this.changed();
  }
  stop() {
    this.settings = { ...this.settings, enabled: false };
    this.clearRecovery();
    this.runner.stop();
    this.status = { state: 'idle', detail: 'Sesión cerrada. El token sigue cifrado para volver a conectar.', updatedAt: Date.now() };
    // Si el disco falla, la sesión ya está detenida y el error se muestra al usuario.
    this.store.write(this.settings);
    this.changed();
  }
  forget() {
    this.stop();
    const next = { ...this.settings, enabled: false, encryptedToken: undefined };
    this.store.write(next);
    this.settings = next;
    this.status = { state: 'idle', detail: 'Guarda un token de dispositivo en Ajustes para conectar.', updatedAt: Date.now() };
    this.changed();
  }
  suspend() {
    this.suspended = true;
    this.clearRecovery();
    this.runner.stop();
    if (this.settings.enabled) this.status = { state: 'paused', detail: 'En suspensión; se retomará al despertar.', updatedAt: Date.now() };
    this.changed();
  }
  resume() {
    if (!this.suspended || this.quitting) return;
    this.suspended = false;
    if (this.settings.enabled) {
      try { this.activate(); } catch (error) { this.fail(error); }
    }
  }
  /** Recuperación de un worker muerto: nunca dejar un cerebro sin actividad como online. */
  brainFailed() {
    if (!this.settings.enabled || this.suspended || this.quitting || this.recovery) return;
    this.runner.stop();
    this.status = { state: 'error', detail: 'Reiniciando el cerebro local…', updatedAt: Date.now() };
    this.recovery = setTimeout(() => {
      this.recovery = undefined;
      if (this.settings.enabled && !this.suspended && !this.quitting) {
        try { this.activate(); } catch (error) { this.fail(error); }
      }
    }, 5_000);
    this.changed();
  }
  quit() {
    this.quitting = true;
    this.clearRecovery();
    this.runner.stop();
  }
  private activate() {
    const config: RunnerConfig = { serverUrl: SERVICE_URL, token: this.store.unseal(this.settings) };
    void this.runner.startWhenAvailable(config);
  }
  private clearRecovery() { clearTimeout(this.recovery); this.recovery = undefined; }
  private fail(error: unknown) {
    this.status = { state: 'error', detail: error instanceof Error ? error.message : 'No se pudo iniciar.', updatedAt: Date.now() };
    this.changed();
  }
}
