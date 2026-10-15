import type { FlySnapshot, RunnerStatus, GardenSnapshot, NeuralSnapshot } from '../../core/types';

export type DesktopState = {
  enabled: boolean;
  hasToken: boolean;
  launchAtLogin: boolean;
  loginAvailable: boolean;
  status: RunnerStatus;
  fly?: FlySnapshot;
  garden?: GardenSnapshot;
};
export type Result = { ok: true } | { ok: false; error: string };
export interface DesktopAPI {
  brain(): Promise<NeuralSnapshot | undefined>;
  state(): Promise<DesktopState>;
  saveToken(token: string): Promise<Result>;
  start(token?: string): Promise<Result>;
  stop(): Promise<Result>;
  forget(): Promise<Result>;
  login(enabled: boolean): Promise<Result>;
  website(): Promise<Result>;
  hide(): Promise<Result>;
  quit(): Promise<Result>;
}
export const SERVICE_URL = 'https://moscas.lol';
export function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^fly_device_[a-f0-9]{64}$/.test(value);
}
