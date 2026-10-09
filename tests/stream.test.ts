import { test } from 'vitest';
import assert from 'node:assert/strict';
import { GardenStream } from '../src/core/runtime/garden-stream';
import { ObservationCadence } from '../src/core/runtime/observation-cadence';
import { packDelta } from '../src/core/simulation/protocol/stream';
import type { FlyState, ServerMessage, WorldDelta } from '../src/core/simulation/protocol/index';

const fly = (): FlyState => ({
  flyId: 'a',
  ownerId: 'u',
  name: 'A',
  createdAt: 1,
  position: [1, 0.25, 1],
  velocity: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  timestamp: 1,
  lastSeenAt: 1,
  energy: 83.45,
  connected: true,
  mode: 'flywire',
  totalLifeTime: 0,
  status: 'Idle',
  needs: { hunger: 90.5, hydration: 76.4, updatedAt: 1 },
});
const welcome = (): Extract<ServerMessage, { type: 'WELCOME' }> => ({
  type: 'WELCOME',
  fly: fly(),
  world: {
    worldId: 'garden',
    tick: 0,
    timestamp: 1,
    flies: [{ ...fly(), energy: 83 }],
    objects: [],
  },
  events: [],
  chat: [],
  awaySince: null,
});
const delta = (): WorldDelta => ({ worldId: 'garden', tick: 1, timestamp: 2 });

test('v3 keeps precise owner state and local motion while applying private authority', () => {
  const stream = new GardenStream();
  assert.equal(stream.apply(welcome())!.flies[0].energy, 83.45);
  const local = fly();
  local.position = [3, 0.25, 4];
  const world = stream.apply(
    {
      type: 'WORLD_FRAME',
      sequence: 1,
      delta: packDelta(delta()),
      control: [
        {
          flyId: 'a',
          set: {
            energy: 81.3,
            needs: { hunger: 85, hydration: 77.6, updatedAt: 2 },
          },
        },
      ],
    },
    local,
  )!;
  assert.deepEqual(world.flies[0].position, local.position);
  assert.equal(world.flies[0].energy, 81.3);
  assert.equal(world.flies[0].needs?.hydration, 77.6);
  assert.notEqual(world.flies[0].position, local.position);
});

test('v3 handles interventions, cleared fields, and rejects lost or duplicate frames', () => {
  const stream = new GardenStream();
  stream.apply(welcome());
  const local = fly();
  const purchase = {
    id: 'p',
    code: 'dance' as const,
    flyId: 'a',
    startedAt: 1,
    endsAt: 20,
    origin: local.position,
    target: local.position,
  };
  const first = {
    type: 'WORLD_FRAME' as const,
    sequence: 7,
    delta: packDelta(delta()),
    control: [
      {
        flyId: 'a',
        set: {
          intervention: purchase,
          position: [9, 0.25, 9] as FlyState['position'],
        },
      },
    ],
  };
  assert.deepEqual(stream.apply(first, local)!.flies[0].position, [9, 0.25, 9]);
  assert.throws(() => stream.apply({ ...first, sequence: 9 }), /sequence/);
  assert.throws(() => stream.apply(first), /sequence/);
  const next = stream.apply({
    type: 'WORLD_FRAME',
    sequence: 8,
    delta: packDelta(delta()),
    control: [{ flyId: 'a', set: {}, unset: ['intervention'] }],
  })!;
  assert.equal(next.flies[0].intervention, undefined);
  stream.apply(welcome());
  assert.doesNotThrow(() => stream.apply({ ...first, sequence: 1 }));
});

test('legacy snapshots and v2 deltas remain compatible; unknown baselines fail', () => {
  const stream = new GardenStream();
  assert.throws(() => stream.apply({ type: 'WORLD_DELTA', delta: delta() }), /baseline/);
  stream.apply(welcome());
  const next = stream.apply({
    type: 'WORLD_DELTA',
    delta: { ...delta(), flies: [{ flyId: 'a', set: { energy: 70 } }] },
  })!;
  assert.equal(next.flies[0].energy, 70);
  assert.equal(stream.apply({ type: 'WORLD_STATE', world: welcome().world })!.flies[0].energy, 83);
});

test('resting keepalives stay at 1 Hz and flight changes are sent promptly', () => {
  const cadence = new ObservationCadence();
  const local = fly();
  assert.equal(cadence.due(local, 0), true);
  assert.equal(cadence.due(local, 750), false);
  assert.equal(cadence.due(local, 1000), true);
  local.body = { behavior: 'TAKEOFF', flight: 'preparing' } as FlyState['body'];
  assert.equal(cadence.due(local, 1050), false);
  assert.equal(cadence.due(local, 1060), true);
});
