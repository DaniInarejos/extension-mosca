import { validToken, type DesktopAPI, type DesktopState, type Result } from './contracts';
import { renderFly } from '../shared/portrait';
import './style.css';
import { BrainView } from './brain-view';
import { paintFeeding } from './feeding';
import { gardenView } from './presentation';

declare global { interface Window { moscas: DesktopAPI } }
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const token = $<HTMLInputElement>('token');
const login = $<HTMLInputElement>('login');
const names = { idle: 'Sesión cerrada', connecting: 'Conectando', loading: 'Cargando cerebro', online: 'En línea', paused: 'Control cedido', error: 'Error' };
let busy = false;
let lastState: DesktopState | undefined;
let actionError = '';
token.addEventListener('input', () => { actionError = ''; if (lastState) render(lastState); });
function render(state: DesktopState) {
  if (!lastState && !state.hasToken) $<HTMLDetailsElement>('connection').open = true;
  lastState = state;
  $('status').textContent = names[state.status.state];
  $('status').dataset.kind = state.status.state;
  $('detail').textContent = actionError || state.status.detail;
  $('empty').hidden = Boolean(state.fly);
  $('empty-title').textContent = state.enabled ? 'Conectando con tu mosca…' : 'Tu mosca está desconectada.';
  $('empty-detail').textContent = state.enabled ? 'La información de tu mosca llegará con la conexión.' : 'Este equipo puede encargarse de su cerebro, incluso con la ventana cerrada.';
  renderFly(state.fly);
  paintFeeding($('fly-avatar') as unknown as SVGElement, state.fly, state.status.state === 'online');
  document.body.dataset.connected = String(state.status.state === 'online');
  const garden = gardenView(state.garden);
  $('garden').hidden = !state.enabled;
  $('garden').dataset.phase = garden.phase;
  $('garden').dataset.fresh = String(garden.fresh);
  $('garden-phase').textContent = garden.phaseLabel;
  $('garden-detail').textContent = garden.detail;
  const control = $<HTMLButtonElement>('session-toggle');
  const pendingToken = token.value.trim().length > 0;
  control.disabled = busy || (!state.enabled && (!state.hasToken || pendingToken));
  token.disabled = busy || state.enabled;
  $<HTMLButtonElement>('save-token').disabled = busy || state.enabled || !validToken(token.value.trim());
  control.textContent = state.enabled ? 'Desconectar' : 'Conectar';
  control.dataset.action = state.enabled ? 'disconnect' : 'connect';
  $('session-hint').textContent = state.enabled
    ? 'Desconectar detiene el cerebro y cierra la sesión. Tu token queda guardado para volver a conectar.'
    : !state.hasToken ? 'Guarda un token de dispositivo en Ajustes para conectar tu mosca.'
    : pendingToken ? 'Guarda el nuevo token antes de conectar, o borra el campo para usar el token guardado.'
    : 'Conectar inicia el cerebro de tu mosca en este equipo y lo mantiene activo aunque cierres la ventana.';
  $<HTMLButtonElement>('forget').disabled = busy || !state.hasToken;
  login.disabled = busy || !state.loginAvailable;
  login.checked = state.launchAtLogin;
  $('login-hint').textContent = state.loginAvailable ? 'Se abrirá en segundo plano. Solo simula si está activada.' : 'Disponible al instalar la aplicación.';
  $('token-hint').textContent = pendingToken && !validToken(token.value.trim()) ? 'Revisa el token: pega el valor completo que te da moscas.lol.' : state.hasToken ? state.enabled ? 'Desconecta para cambiar el token guardado.' : 'Token cifrado guardado. Puedes conectar o guardar otro token.' : 'Pega el token de moscas.lol y guárdalo. Se cifra en este equipo; guardar no inicia el cerebro.';
}
async function refresh() {
  if (!busy) render(await window.moscas.state());
}
async function action(callback: () => Promise<Result>) {
  busy = true;
  actionError = '';
  if (lastState) render(lastState);
  try {
    const result = await callback();
    busy = false;
    await refresh();
    if (!result.ok) { actionError = result.error; $('detail').textContent = actionError; }
  } catch {
    actionError = 'No se pudo completar la operación. Vuelve a abrir la ventana.';
    $('detail').textContent = 'No se pudo completar la operación. Vuelve a abrir la ventana.';
  } finally { busy = false; }
}
$('session-toggle').onclick = () => {
  if (busy) return;
  const disconnect = lastState?.enabled === true;
  void action(async () => {
    if (disconnect) { token.value = ''; return window.moscas.stop(); }
    if (!lastState?.hasToken || token.value.trim()) return { ok: false, error: 'Guarda un token de dispositivo en Ajustes antes de conectar.' };
    const result = await window.moscas.start();
    if (result.ok) $<HTMLDetailsElement>('connection').open = false;
    return result;
  });
};
$('save-token').onclick = () => {
  if (busy) return;
  const value = token.value.trim();
  if (!validToken(value)) return;
  void action(async () => {
    const result = await window.moscas.saveToken(value);
    token.value = '';
    return result;
  });
};
$('website').onclick = () => void action(() => window.moscas.website());
$('forget').onclick = () => void action(() => window.moscas.forget());
login.onchange = () => { const enabled = login.checked; void action(() => window.moscas.login(enabled)); };
$('hide').onclick = () => { token.value = ''; void action(() => window.moscas.hide()); };
$('quit').onclick = () => { token.value = ''; void window.moscas.quit(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) token.value = '';
  else void refresh();
});
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 750);

const brainView = new BrainView($<HTMLDetailsElement>('brain-view'), () => window.moscas.brain());
window.addEventListener('pagehide', () => brainView.dispose(), { once: true });
