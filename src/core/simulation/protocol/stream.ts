import type { BodyPose, FlyStatePatch, WorldDelta } from './index';

// Wire format v3. Keep the ordering stable; older clients continue to use v1/v2.
const poseFields = [
  'behavior',
  'flight',
  'groomingTarget',
  'intensity',
  'legs',
  'wings',
  'headYaw',
  'headPitch',
  'antennaLeft',
  'antennaRight',
  'proboscis',
  'pitch',
  'roll',
] as const;
type PackedSet = Omit<FlyStatePatch['set'], 'body'> & { body?: (string | number)[] };
type PackedPatch = [string, PackedSet, FlyStatePatch['unset']?];
export type StreamDelta = Omit<WorldDelta, 'flies'> & { flies?: PackedPatch[] };

export function packDelta(delta: WorldDelta): StreamDelta {
  return {
    ...delta,
    flies: delta.flies?.map(({ flyId, set, unset }): PackedPatch => {
      const { body, ...rest } = set;
      const packed: PackedSet = {
        ...rest,
        ...(body ? { body: poseFields.map((key) => body[key]) } : {}),
      };
      return unset?.length ? [flyId, packed, unset] : [flyId, packed];
    }),
  };
}

export function unpackDelta(delta: StreamDelta): WorldDelta {
  return {
    ...delta,
    flies: delta.flies?.map(([flyId, set, unset]) => {
      const { body, ...rest } = set;
      const pose = body && Object.fromEntries(poseFields.map((key, i) => [key, body[i]]));
      return {
        flyId,
        set: { ...rest, ...(pose ? { body: { ...pose, phase: 0 } as BodyPose } : {}) },
        ...(unset ? { unset } : {}),
      };
    }),
  };
}
