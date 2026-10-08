import type {
  BodyBehavior,
  CompanionBrainTelemetry,
  FlyAppearance,
  FlyState,
  OfflineAction,
  SimulationMode,
  Vec3,
  WorldDelta,
  WorldState,
} from '../simulation/protocol/index';
import type { NaturalGardenEventCode } from '../simulation/protocol/natural-events';

export const MOSCAS_ORIGIN = 'https://moscas.lol' as const;

export interface ApiError {
  error: string;
}

export interface HealthResponse {
  ok: true;
  ready: boolean;
  flies: number;
  storage: 'mongodb' | 'file';
  eventRecording: {
    observed: number;
    stored: number;
    suppressed: number;
    reduction: number;
    byType: Record<string, number>;
  };
}

export interface ReadyResponse {
  ok: true;
  ready: true;
}

export type PublicWorldResponse = WorldState;
export type PublicWorldDeltaResponse = WorldDelta;

export interface DeviceSimulationTicketResponse {
  ticket: string;
  expiresAt: number;
}

export type DeviceBrainTelemetryRequest = Omit<
  CompanionBrainTelemetry,
  'deviceId' | 'deviceLabel' | 'updatedAt'
>;

export interface DeviceStateResponse {
  protocol: 1;
  serverTime: number;
  device: {
    id: string;
    label: string;
    online: true;
    lastSeenAt: number;
  };
  fly: {
    flyId: string;
    name: string;
    appearance?: FlyAppearance;
    energy: number;
    status: string;
    action: OfflineAction | Lowercase<BodyBehavior> | 'rest';
    mode: SimulationMode;
    connected: boolean;
    companionConnected?: boolean;
    companionLastSeenAt?: number;
    companionBrain?: CompanionBrainTelemetry;
    position: Vec3;
    velocity: Vec3;
    death?: FlyState['death'];
  };
  garden: {
    phase: number;
    naturalEvent: NaturalGardenEventCode | null;
  };
}

export interface LinkedDevice {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt?: number | null;
  online?: boolean;
}
