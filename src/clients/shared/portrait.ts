import { flyColorHex, type FlyColor } from '../../core/simulation/protocol/appearance';
import type { FlySnapshot } from '../../core/types';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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

export function renderFly(fly?: FlySnapshot) {
  const flyCard = $('fly-card');
  const avatar = document.getElementById('fly-avatar') as unknown as SVGElement;
  const energyTrack = document.querySelector<HTMLElement>('.energy-track')!;
  flyCard.hidden = !fly;
  if (!fly) return;
  const action = flyAction(fly);
  const energy = Math.round(fly.energy);
  $('fly-name').textContent = fly.name;
  $('fly-action').textContent = action;
  $('fly-status').textContent = fly.status;
  $('energy-value').textContent = `${energy}%`;
  $('energy-fill').style.transform = `scaleX(${energy / 100})`;
  energyTrack.setAttribute('aria-valuenow', String(energy));
  paintFly(avatar, fly);
}


export function flyAction(fly: FlySnapshot): string {
  if (fly.pose.behavior === 'FEED' && fly.feeding === 'water') return 'Bebiendo';
  return fly.pose.behavior === 'GROOM'
      ? `Limpiándose ${groomingNames[fly.pose.groomingTarget]}`
      : actionNames[fly.pose.behavior];
}

/** Mismo retrato para el popup y la ventana de escritorio. */
export function paintFly(avatar: SVGElement, fly: FlySnapshot) {
  const action = flyAction(fly);
  const energy = Math.round(fly.energy);
  const body = fly.appearance.body as FlyColor;
  const eyes = fly.appearance.eyes as FlyColor;
  const wings = fly.appearance.wings as FlyColor;
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
