export type RunnerStatus = {
  state: 'idle' | 'connecting' | 'loading' | 'online' | 'paused' | 'error';
  detail: string;
  flyName?: string;
  updatedAt: number;
};

export type FlySnapshot = {
  name: string;
  energy: number;
  status: string;
  appearance: {
    eyes: string;
    body: string;
    wings: string;
  };
  pose: {
    behavior: 'WALK' | 'IDLE' | 'GROOM' | 'FEED' | 'ALERT' | 'TAKEOFF' | 'FLIGHT' | 'LAND';
    flight: 'ground' | 'preparing' | 'airborne' | 'landing';
    phase: number;
    intensity: number;
    groomingTarget: 'legs' | 'head' | 'antennae' | 'wings' | 'abdomen';
    wings: number;
    antennaLeft: number;
    antennaRight: number;
    proboscis: number;
    pitch: number;
    roll: number;
  };
  updatedAt: number;
};

export type RunnerConfig = {
  serverUrl: string;
  token: string;
};
import type { z } from 'zod';
import type { clientMessageSchema } from './simulation/protocol/index';

export type ClientMessage = z.infer<typeof clientMessageSchema>;
