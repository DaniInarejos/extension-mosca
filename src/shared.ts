export type RunnerStatus = {
  state: 'idle' | 'connecting' | 'loading' | 'online' | 'error';
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

export type ExtensionConfig = {
  enabled: boolean;
  serverUrl: string;
  token: string;
};

export const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: false,
  serverUrl: 'https://moscas.lol',
  token: '',
};

export const IDLE_STATUS: RunnerStatus = {
  state: 'idle',
  detail: 'El cerebro está detenido.',
  updatedAt: 0,
};

export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'START'; config: Omit<ExtensionConfig, 'enabled'> }
  | { type: 'STOP' }
  | { type: 'RUNNER_START'; config: ExtensionConfig }
  | { type: 'RUNNER_STOP' }
  | { type: 'RUNNER_SNAPSHOT' }
  | { type: 'RUNNER_STATUS'; status: RunnerStatus };
