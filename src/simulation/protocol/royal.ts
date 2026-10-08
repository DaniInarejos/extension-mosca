import type { NaturalGardenEvent, NaturalGardenEventCode } from './natural-events';
import type { UserRole } from './user';

export interface RoyalOnlineUser {
  userId: string;
  email: string | null;
  role: UserRole;
  flyId: string;
  flyName: string;
  status: string;
  energy: number;
  connection: 'browser' | 'device' | 'browser+device';
}

export interface RoyalFoodStatus {
  id: string;
  name: string;
  kind: string;
  amount: number;
  capacity: number;
}

export interface RoyalRecentFly {
  userId: string;
  email: string | null;
  role: UserRole;
  flyId: string;
  flyName: string;
  createdAt: number;
  status: string;
  state: 'online' | 'offline' | 'deceased';
}

export interface RoyalBrainControl {
  flyId: string;
  flyName: string;
  ownerUserId: string;
  ownerEmail: string | null;
  controllerUserId: string;
  controllerEmail: string | null;
  source: 'browser' | 'hosted' | 'device' | 'browser+device';
}

export interface RoyalControlState {
  serverTime: number;
  garden: {
    tick: number;
    users: number;
    flies: number;
    livingFlies: number;
    onlineFlies: number;
    activeBrains: number;
    onlineUsers: number;
    naturalEvent?: NaturalGardenEvent;
    naturalEventNextAt: number;
    purchasedEvent?: { code: string; label: string; endsAt: number };
  };
  online: RoyalOnlineUser[];
  brainControls: RoyalBrainControl[];
  recentFlies: RoyalRecentFly[];
  food: RoyalFoodStatus[];
  eventOptions: {
    code: NaturalGardenEventCode;
    label: string;
    phases: readonly string[];
  }[];
}
