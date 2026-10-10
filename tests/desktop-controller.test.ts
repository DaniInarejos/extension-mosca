import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopController } from '../src/clients/desktop/controller';
import { DesktopStore } from '../src/clients/desktop/store';
import { desktopCapacity } from '../src/adapters/desktop/capacity';

const token = `fly_device_${'a'.repeat(64)}`;
const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'moscas-unit-'));
  directories.push(directory);
  // Solo doble unitario: el E2E usa safeStorage real.
  const vault = { isEncryptionAvailable: () => true, encryptString: (_: string) => Buffer.from('ciphertext'), decryptString: (_: Buffer) => token };
  const file = join(directory, 'settings.json');
  const store = new DesktopStore(file, vault);
  const runner = { start: vi.fn(async () => {}), startWhenAvailable: vi.fn(async () => {}), stop: vi.fn(), snapshot: vi.fn() };
  return { store, runner, vault, file, controller: new DesktopController(store, runner) };
}
afterEach(() => { vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('guardar credenciales es independiente de activar y un fallo no sustituye el token anterior', () => {
  const { store, runner, controller } = fixture();
  controller.saveToken(token);
  expect(store.read().encryptedToken).toBeDefined();
  expect(store.read().enabled).toBe(false);
  expect(runner.start).not.toHaveBeenCalled();
  const previous = { ...controller.settings };
  vi.spyOn(store, 'write').mockImplementation(() => { throw new Error('disco'); });
  expect(() => controller.saveToken(token)).toThrow();
  expect(controller.settings).toEqual(previous);
  expect(runner.start).not.toHaveBeenCalled();
});
it('cifra el token y restaura la activación sin inferirla de su existencia', () => {
  const { store, runner, file, controller } = fixture();
  controller.start(token);
  expect(readFileSync(file, 'utf8').includes(token)).toBe(false);
  expect(store.read().enabled).toBe(true);
  controller.quit();
  expect(store.read().enabled).toBe(true);
  new DesktopController(store, runner).restore();
  expect(runner.start).toHaveBeenCalledOnce();
  expect(runner.startWhenAvailable).toHaveBeenCalledOnce();
});
it('Detener impide la reactivación al despertar y al reiniciar', () => {
  const { store, runner, controller } = fixture();
  controller.start(token); controller.suspend(); controller.stop(); controller.resume();
  new DesktopController(store, runner).restore();
  expect(runner.start).toHaveBeenCalledOnce();
  expect(store.read().enabled).toBe(false);
});
it('suspender cancela recursos y despertar solo reanuda una vez', () => {
  const { runner, controller } = fixture();
  controller.start(token); controller.suspend(); controller.resume(); controller.resume();
  expect(runner.stop).toHaveBeenCalledOnce();
  expect(runner.start).toHaveBeenCalledOnce();
  expect(runner.startWhenAvailable).toHaveBeenCalledOnce();
});
it('salir cancela la recuperación del worker y bloquea arranques tardíos', () => {
  vi.useFakeTimers();
  const { runner, controller } = fixture();
  controller.start(token); controller.brainFailed(); controller.quit();
  vi.advanceTimersByTime(30_000); controller.start(token); controller.resume();
  expect(runner.start).toHaveBeenCalledOnce();
});
it('fallo del worker libera y reinicia con espera; detener cancela ese intento', () => {
  vi.useFakeTimers();
  const { runner, controller } = fixture();
  controller.start(token); controller.brainFailed(); controller.brainFailed();
  vi.advanceTimersByTime(5_000);
  expect(runner.start).toHaveBeenCalledOnce();
  expect(runner.startWhenAvailable).toHaveBeenCalledOnce();
  controller.brainFailed(); controller.stop(); vi.advanceTimersByTime(5_000);
  expect(runner.start).toHaveBeenCalledOnce();
  expect(runner.startWhenAvailable).toHaveBeenCalledOnce();
});
it('Olvidar elimina el ciphertext y desactiva la sesión', () => {
  const { store, controller } = fixture();
  controller.start(token); controller.forget();
  expect(store.read()).toEqual({ enabled: false });
});
it('rechaza credenciales inválidas y almacenes no disponibles sin guardar texto plano', () => {
  const { controller, store, vault, runner } = fixture();
  expect(() => controller.start('incorrecto')).toThrow();
  vault.isEncryptionAvailable = () => false;
  expect(() => controller.start(token)).toThrow();
  expect(store.read().enabled).toBe(false);
  expect(runner.start).not.toHaveBeenCalled();
});
it('configuración dañada no inicia ni se sobrescribe automáticamente', () => {
  const { controller, file, runner } = fixture();
  writeFileSync(file, 'incorrecto'); controller.restore();
  expect(controller.status.state).toBe('error');
  expect(runner.start).not.toHaveBeenCalled();
  expect(readFileSync(file, 'utf8')).toBe('incorrecto');
});
it('Detener libera recursos incluso si falla la persistencia y comunica el fallo', () => {
  const { controller, store, runner } = fixture();
  controller.start(token); vi.spyOn(store, 'write').mockImplementation(() => { throw new Error('disco'); });
  expect(() => controller.stop()).toThrow();
  expect(runner.stop).toHaveBeenCalledOnce();
  expect(controller.settings.enabled).toBe(false);
});
it('la oferta voluntaria deja margen en equipos pequeños', () => {
  const gib = 1024 ** 3;
  expect(desktopCapacity(2, 16 * gib)).toBe(0);
  expect(desktopCapacity(8, 2 * gib)).toBe(0);
  expect(desktopCapacity(4, 4 * gib)).toBe(1);
  expect(desktopCapacity(6, 4 * gib)).toBe(2);
  expect(desktopCapacity(8, 8 * gib)).toBe(3);
});
it('ignora la antigua mosca de escritorio y conserva token y activación al migrar', () => {
  const { controller, store, runner, file } = fixture();
  controller.start(token);
  const previous = store.read();
  writeFileSync(file, JSON.stringify({ version: 1, ...previous, companionVisible: true, companionPosition: { x: -150, y: 30 } }));
  expect(store.read()).toEqual(previous);
  const restored = new DesktopController(store, runner);
  restored.restore();
  expect(runner.startWhenAvailable).toHaveBeenCalledOnce();
  expect(restored.settings).toEqual(previous);
  restored.stop();
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, enabled: false, encryptedToken: previous.encryptedToken });
});
