import type { ExtensionConfig, ExtensionMessage, RunnerStatus } from '../shared';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const server = $<HTMLInputElement>('server');
const token = $<HTMLInputElement>('token');
const status = $('status');
const detail = $('detail');

function show(value: RunnerStatus) {
  const names = { idle: 'Detenida', connecting: 'Conectando', loading: 'Cargando cerebro', online: 'En línea', error: 'Error' };
  status.textContent = value.flyName ? `${names[value.state]} · ${value.flyName}` : names[value.state];
  status.dataset.kind = value.state;
  detail.textContent = value.detail;
}

async function state() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies ExtensionMessage) as {
    config: ExtensionConfig;
    status: RunnerStatus;
  };
  server.value = result.config.serverUrl;
  token.value = result.config.token;
  show(result.status);
}

$('start').onclick = async () => {
  const serverUrl = server.value.trim().replace(/\/$/, '');
  const deviceToken = token.value.trim();
  if (!/^https?:\/\//.test(serverUrl) || !/^fly_device_[a-f0-9]{64}$/.test(deviceToken)) {
    show({ state: 'error', detail: 'Revisa la URL y el token de dispositivo.', updatedAt: Date.now() });
    return;
  }
  show({ state: 'connecting', detail: 'Preparando el runner…', updatedAt: Date.now() });
  const result = await chrome.runtime.sendMessage({
    type: 'START',
    config: { serverUrl, token: deviceToken },
  } satisfies ExtensionMessage) as { error?: string };
  if (result?.error) show({ state: 'error', detail: result.error, updatedAt: Date.now() });
  else window.setTimeout(() => void state(), 500);
};

$('stop').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'STOP' } satisfies ExtensionMessage);
  await state();
};

void state();
