import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, powerSaveBlocker, safeStorage, session, shell, Tray } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MoskaRunner } from '../../core/runner';
import { webClock } from '../../adapters/web/clock';
import { AUTHENTICATION_ERROR, desktopDeviceClient } from '../../adapters/desktop/device-client';
import { DesktopBrain } from '../../adapters/desktop/brain';
import { desktopCapacity } from '../../adapters/desktop/capacity';
import { DesktopController } from './controller';
import { DesktopStore } from './store';
import { validToken, type DesktopState, type Result } from './contracts';

app.setName('Moscas');
// Solo desarrollo/pruebas: el paquete instalado siempre usa su perfil del sistema.
if (!app.isPackaged && process.env.MOSCAS_DESKTOP_PROFILE) app.setPath('userData', process.env.MOSCAS_DESKTOP_PROFILE);
const ownsLock = app.requestSingleInstanceLock();
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let controller: DesktopController | undefined;
let runner: MoskaRunner | undefined;
const brains = new Set<DesktopBrain>();
let blocker: number | undefined;
let quitting = false;
let transport: ReturnType<typeof desktopDeviceClient> | undefined;
const loginSettings = () => app.getLoginItemSettings({ args: ['--hidden'] });
const documentUrl = pathToFileURL(join(__dirname, 'index.html')).href;

function showWindow() {
  if (!controller || quitting) return;
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({
      width: 420, height: 720, minWidth: 360, minHeight: 560, show: false,
      title: 'Moscas', icon: join(__dirname, 'app-icon.png'), backgroundColor: '#f4f0e5',
      webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.on('close', (event) => { if (!quitting) { event.preventDefault(); window?.hide(); } });
    window.once('ready-to-show', () => window?.show());
    void window.loadURL(documentUrl);
  } else {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

function refresh() {
  if (!controller || quitting) return;
  const active = ['online', 'loading'].includes(controller.status.state) && controller.settings.enabled;
  if (active && blocker === undefined) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!active && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
  tray?.setToolTip(`Moscas · ${controller.status.state}`);
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar ventana', click: showWindow },
    { type: 'separator' },
    { label: 'Conectar', enabled: !controller.settings.enabled && Boolean(controller.settings.encryptedToken), click: () => perform(() => controller!.start()) },
    { label: 'Desconectar', enabled: controller.settings.enabled, click: () => perform(() => controller!.stop()) },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]));
}

function perform(action: () => void): Result {
  try { action(); refresh(); return { ok: true }; }
  catch {
    const error = 'No se pudo guardar o desbloquear la configuración. Revisa el token, el almacén seguro y los permisos del perfil.';
    if (controller) controller.status = { state: 'error', detail: error, updatedAt: Date.now() };
    refresh();
    return { ok: false, error };
  }
}

function shutdown() {
  if (quitting) return;
  quitting = true;
  controller?.quit();
  transport?.dispose();
  if (blocker !== undefined) powerSaveBlocker.stop(blocker);
  tray?.destroy();
}

if (!ownsLock) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => { /* La bandeja mantiene la aplicación activa. */ });
  app.on('before-quit', shutdown);
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // El renderer no necesita acceso de red, ni siquiera con una navegación accidental.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    transport = desktopDeviceClient(!app.isPackaged ? process.env.MOSCAS_DESKTOP_PROXY : undefined);
    if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, 'app-icon.png'));
    runner = new MoskaRunner({
      device: transport.device, clock: webClock,
      createBrain: (rate) => {
        const brain = new DesktopBrain(app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'brain') : join(__dirname, 'brain'), rate, () => queueMicrotask(() => controller?.brainFailed()));
        brains.add(brain);
        const dispose = brain.dispose.bind(brain);
        brain.dispose = () => { brains.delete(brain); dispose(); };
        return brain;
      },
      volunteerCapacity: desktopCapacity(),
      onStatus: (status) => {
        if (!controller) return;
        // Las excepciones de transporte y mensajes remotos nunca atraviesan IPC ni logs.
        controller.status = { ...status, detail: status.state === 'error' && status.detail !== AUTHENTICATION_ERROR ? 'No se pudo conectar o ejecutar el cerebro. Se reintentará automáticamente.' : status.detail };
        refresh();
      },
    });
    controller = new DesktopController(new DesktopStore(join(app.getPath('userData'), 'settings.json'), safeStorage), runner, refresh);
    const icon = nativeImage.createFromPath(join(__dirname, process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png')).resize({ width: 18, height: 18 });
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.on('click', showWindow);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ label: 'Moscas', submenu: [{ label: 'Mostrar ventana', click: showWindow }, { role: 'quit' as const }] }] : []),
      { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    ]));
    powerMonitor.on('suspend', () => controller?.suspend());
    powerMonitor.on('resume', () => controller?.resume());
    powerMonitor.on('shutdown', () => app.quit());
    const state = (): DesktopState => ({
      enabled: controller!.settings.enabled, hasToken: Boolean(controller!.settings.encryptedToken),
      launchAtLogin: app.isPackaged && loginSettings().openAtLogin,
      loginAvailable: app.isPackaged && ['darwin', 'win32'].includes(process.platform),
      status: controller!.status, fly: controller!.settings.enabled ? runner!.snapshot() : undefined,
      garden: controller!.settings.enabled ? runner!.gardenSnapshot() : undefined,
    });
    const handlers: Record<string, (value?: unknown) => unknown> = {
      brain: () => window?.isVisible() && !window.isMinimized() && controller?.status.state === 'online' ? runner?.neuralSnapshot() : undefined,
      state,
      saveToken: (value) => {
        if (controller!.settings.enabled) return { ok: false, error: 'Desconecta antes de cambiar el token.' };
        if (typeof value !== 'string' || !validToken(value.trim())) return { ok: false, error: 'Revisa el token de dispositivo.' };
        return perform(() => controller!.saveToken(value));
      },
      start: (value) => perform(() => {
        if (value !== undefined && (typeof value !== 'string' || value.length > 100)) throw new Error();
        controller!.start(value as string | undefined);
      }),
      stop: () => perform(() => controller!.stop()),
      forget: () => perform(() => controller!.forget()),
      login: (enabled) => perform(() => {
        if (!state().loginAvailable || typeof enabled !== 'boolean') throw new Error();
        app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
        if (loginSettings().openAtLogin !== enabled) throw new Error();
      }),
      website: async () => {
        try { await shell.openExternal('https://moscas.lol'); return { ok: true }; }
        catch { return { ok: false, error: 'No se pudo abrir el navegador.' }; }
      },
      hide: () => perform(() => window?.hide()),
      quit: () => { setImmediate(() => app.quit()); return { ok: true }; },
    };
    for (const [name, handler] of Object.entries(handlers)) {
      ipcMain.handle(`desktop:${name}`, (event, value: unknown) => {
        if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== documentUrl) return { ok: false, error: 'Origen no autorizado.' };
        return handler(value);
      });
    }
    if (!process.argv.includes('--hidden') && !loginSettings().wasOpenedAtLogin) showWindow();
    controller.restore();
  }).catch(() => { shutdown(); app.exit(1); });
}

/** Diagnóstico local sin credenciales; no se expone al renderer por IPC. */
export function diagnostics() {
  return {
    enabled: controller?.settings.enabled ?? false,
    state: controller?.status.state ?? 'idle',
    hasFly: Boolean(runner?.snapshot()),
    brains: [...brains].map((brain) => ({ tick: brain.getActivity().tick, neurons: brain.getActivity().neurons })),
    powerBlocker: blocker !== undefined && powerSaveBlocker.isStarted(blocker),
  };
}
