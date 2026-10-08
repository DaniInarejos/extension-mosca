import type { FlyWireBrain, ServerMessage } from './simulation/protocol/index';
import type { ClientMessage, RunnerConfig, RunnerStatus } from './types';

export interface Brain extends FlyWireBrain {
  onError: (detail: string) => void;
}

export type BrainFactory = (tickRate: number) => Brain;
export type CancelTimer = () => void;

export interface Clock {
  now(): number;
  timestamp(): number;
  setTimeout(callback: () => void, delay: number): CancelTimer;
  setInterval(callback: () => void, delay: number): CancelTimer;
}

export interface GardenConnection {
  isOpen(): boolean;
  send(message: ClientMessage): void;
  close(): void;
}

export interface GardenEvents {
  onOpen(): void;
  onMessage(message: ServerMessage): Promise<void>;
  onClose(code: number): void;
  onError(detail: string): void;
}

export interface DeviceClient {
  ticket(config: RunnerConfig, signal?: AbortSignal): Promise<string>;
  /** Entrega los eventos de forma asíncrona, después de devolver la conexión. */
  connect(config: RunnerConfig, ticket: string, events: GardenEvents): GardenConnection;
  isFlyConnected(config: RunnerConfig, signal?: AbortSignal): Promise<boolean>;
}

export interface RunnerDependencies {
  device: DeviceClient;
  clock: Clock;
  createBrain: BrainFactory;
  volunteerCapacity: number;
  onStatus(status: RunnerStatus): void | Promise<void>;
}
