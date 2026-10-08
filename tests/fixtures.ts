import { vi } from 'vitest';
import type { Brain } from '../src/core/ports';
import type { FlyState, ServerMessage, WorldState } from '../src/core/simulation/protocol/index';

export function createBrain(): Brain {
  return {
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(),
    reset: vi.fn(),
    onError: vi.fn(),
    step: vi.fn(() => ({ forward: 0, turn: 0, lift: 0, feed: 0 })),
    getActivity: () => ({
      tick: 0, fired: 0, neurons: 0, edges: 0, tickMs: 0, groups: [],
      motor: { forward: 0, turn: 0, lift: 0, feed: 0 },
    }),
  };
}

export function welcome(): Extract<ServerMessage, { type: 'WELCOME' }> {
  const fly: FlyState = {
    flyId: 'test-fly', ownerId: 'test-owner', name: 'Mosca de prueba',
    createdAt: 0, position: [0, 0, 0], velocity: [0, 0, 0], rotation: [0, 0, 0, 1],
    timestamp: 0, lastSeenAt: 0, energy: 80, connected: true,
    mode: 'flywire', totalLifeTime: 0, status: 'Descansando',
  };
  const world: WorldState = {
    worldId: 'test-world', objects: [], flies: [fly], tick: 0, timestamp: 0,
  };
  return { type: 'WELCOME', world, fly, events: [], chat: [], awaySince: null };
}
