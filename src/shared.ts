export type RunnerStatus = {
  state: 'idle' | 'connecting' | 'loading' | 'online' | 'error';
  detail: string;
  flyName?: string;
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
  | { type: 'RUNNER_STATUS'; status: RunnerStatus };
