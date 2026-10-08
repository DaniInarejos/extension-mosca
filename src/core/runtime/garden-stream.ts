import type { FlyState, ServerMessage, WorldState } from '../simulation/protocol/index';
import { applyWorldDelta } from '../simulation/protocol/world-delta';
import { unpackDelta } from '../simulation/protocol/stream';

/** Per-connection baseline. A lost frame requires a fresh WELCOME, never a skipped patch. */
export class GardenStream {
  private sequence?: number;
  world?: WorldState;

  apply(message: ServerMessage, local?: FlyState): WorldState | undefined {
    if (message.type === 'WELCOME') {
      this.sequence = undefined;
      this.world = {
        ...message.world,
        flies: message.world.flies.map((fly) =>
          fly.flyId === message.fly.flyId ? structuredClone(message.fly) : fly,
        ),
      };
    } else if (message.type === 'WORLD_STATE') this.world = message.world;
    else if (message.type === 'WORLD_DELTA' || message.type === 'WORLD_FRAME') {
      if (!this.world) throw new Error('Missing stream baseline');
      if (message.type === 'WORLD_FRAME') {
        if (this.sequence !== undefined && message.sequence !== this.sequence + 1)
          throw new Error('Stream sequence gap');
        this.sequence = message.sequence;
        const delta = unpackDelta(message.delta);
        const ownMotion =
          local && !local.intervention && !local.death
            ? [
                {
                  flyId: local.flyId,
                  set: {
                    position: [...local.position] as FlyState['position'],
                    velocity: [...local.velocity] as FlyState['velocity'],
                    rotation: [...local.rotation] as FlyState['rotation'],
                    body: local.body && { ...local.body },
                  },
                },
              ]
            : [];
        this.world = applyWorldDelta(this.world, {
          ...delta,
          flies: [...ownMotion, ...(delta.flies ?? []), ...message.control],
        });
      } else this.world = applyWorldDelta(this.world, message.delta);
    } else return;
    return this.world;
  }
}
