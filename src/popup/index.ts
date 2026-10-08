import { flyColorHex, type FlyColor } from '../simulation/protocol/appearance';
import type { ExtensionConfig, ExtensionMessage, FlySnapshot, RunnerStatus } from '../shared';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const server = $<HTMLInputElement>('server');
const token = $<HTMLInputElement>('token');
const status = $('status');
const detail = $('detail');
const flyCard = $('fly-card');
const avatar = document.getElementById('fly-avatar') as unknown as SVGElement;
const energyTrack = document.querySelector<HTMLElement>('.energy-track')!;
const connection = $<HTMLDetailsElement>('connection');
let flySeen = false;
let refreshing = false;

const connectionNames: Record<RunnerStatus['state'], string> = {
  idle: 'Detenida',
  connecting: 'Conectando',
  loading: 'Cargando cerebro',
  online: 'En línea',
  error: 'Error',
};

const actionNames: Record<FlySnapshot['pose']['behavior'], string> = {
  WALK: 'Caminando',
  IDLE: 'Descansando',
  GROOM: 'Limpiándose',
  FEED: 'Alimentándose',
  ALERT: 'En alerta',
  TAKEOFF: 'Despegando',
  FLIGHT: 'Volando',
  LAND: 'Aterrizando',
};

const groomingNames: Record<FlySnapshot['pose']['groomingTarget'], string> = {
  legs: 'las patas',
  head: 'la cabeza',
  antennae: 'las antenas',
  wings: 'las alas',
  abdomen: 'el abdomen',
};

function show(value: RunnerStatus) {
  status.textContent = connectionNames[value.state];
  status.dataset.kind = value.state;
  detail.textContent = value.detail;
}

function renderFly(fly?: FlySnapshot) {
  flyCard.hidden = !fly;
  if (!fly) return;
  const action =
    fly.pose.behavior === 'GROOM'
      ? `Limpiándose ${groomingNames[fly.pose.groomingTarget]}`
      : actionNames[fly.pose.behavior];
  const body = fly.appearance.body as FlyColor;
  const eyes = fly.appearance.eyes as FlyColor;
  const wings = fly.appearance.wings as FlyColor;
  const energy = Math.round(fly.energy);
  $('fly-name').textContent = fly.name;
  $('fly-action').textContent = action;
  $('fly-status').textContent = fly.status;
  $('energy-value').textContent = `${energy}%`;
  $('energy-fill').style.transform = `scaleX(${energy / 100})`;
  energyTrack.setAttribute('aria-valuenow', String(energy));
  avatar.setAttribute('aria-label', `${fly.name}, ${action}, energía ${energy}%`);
  avatar.dataset.action = fly.pose.behavior;
  avatar.dataset.flight = fly.pose.flight;
  avatar.style.setProperty('--body-color', flyColorHex('body', body));
  avatar.style.setProperty('--eye-color', flyColorHex('eyes', eyes));
  avatar.style.setProperty('--wing-color', flyColorHex('wings', wings));
  avatar.style.setProperty('--pose-intensity', fly.pose.intensity.toFixed(2));
  avatar.style.setProperty('--fly-pitch', `${(fly.pose.pitch * 57.3).toFixed(1)}deg`);
  avatar.style.setProperty('--fly-roll', `${(fly.pose.roll * 57.3).toFixed(1)}deg`);
  avatar.style.setProperty('--phase-delay', `${-(fly.pose.phase % 1).toFixed(2)}s`);
  avatar.style.setProperty(
    '--wing-duration',
    `${Math.max(0.055, 0.18 - fly.pose.wings * 0.12).toFixed(3)}s`,
  );
  avatar.style.setProperty('--proboscis', String(fly.pose.proboscis));
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
    server.value = result.config.serverUrl;
    token.value = result.config.token;
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
