import { renderFly } from '../../shared/portrait';
import type { ExtensionConfig, ExtensionMessage } from '../messages';
import type { FlySnapshot, RunnerStatus } from '../../../core/types';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const server = $<HTMLInputElement>('server');
const token = $<HTMLInputElement>('token');
const status = $('status');
const detail = $('detail');
const connection = $<HTMLDetailsElement>('connection');
let flySeen = false;
let refreshing = false;
let connectionEdited = false;

for (const input of [server, token]) {
  input.addEventListener('input', () => { connectionEdited = true; });
}

const connectionNames: Record<RunnerStatus['state'], string> = {
  idle: 'Detenida',
  connecting: 'Conectando',
  loading: 'Cargando cerebro',
  online: 'En línea',
  paused: 'Control desde la web',
  error: 'Error',
};

function show(value: RunnerStatus) {
  status.textContent = connectionNames[value.state];
  status.dataset.kind = value.state;
  detail.textContent = value.detail;
}


async function state() {
  if (refreshing) return;
  refreshing = true;
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'GET_STATE',
    } satisfies ExtensionMessage)) as {
      config: ExtensionConfig;
      status: RunnerStatus;
      fly?: FlySnapshot;
    };
    if (!connectionEdited) {
      server.value = result.config.serverUrl;
      token.value = result.config.token;
    }
    show(result.status);
    renderFly(result.fly);
    if (result.fly && !flySeen) connection.open = false;
    flySeen = Boolean(result.fly);
  } finally {
    refreshing = false;
  }
}

$('start').onclick = async () => {
  const serverUrl = server.value.trim().replace(/\/$/, '');
  const deviceToken = token.value.trim();
  if (!/^https?:\/\//.test(serverUrl) || !/^fly_device_[a-f0-9]{64}$/.test(deviceToken)) {
    show({
      state: 'error',
      detail: 'Revisa la URL y el token de dispositivo.',
      updatedAt: Date.now(),
    });
    return;
  }
  show({
    state: 'connecting',
    detail: 'Preparando el runner…',
    updatedAt: Date.now(),
  });
  const result = (await chrome.runtime.sendMessage({
    type: 'START',
    config: { serverUrl, token: deviceToken },
  } satisfies ExtensionMessage)) as { error?: string };
  if (result?.error) show({ state: 'error', detail: result.error, updatedAt: Date.now() });
  else window.setTimeout(() => void state(), 400);
};

$('stop').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'STOP' } satisfies ExtensionMessage);
  renderFly();
  connection.open = true;
  await state();
};

void state();
window.setInterval(() => void state(), 750);
