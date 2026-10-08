import type { EventType } from './index';

export type Rarity = 'white' | 'blue' | 'yellow' | 'legendary';
export const RARITIES: Record<Rarity, string> = {
  white: 'Común',
  blue: 'Inusual',
  yellow: 'Excepcional',
  legendary: 'Legendaria',
};
export interface RewardRule {
  label: string;
  rarity: Rarity;
  points: number;
  cooldown: number;
}
const rule = (label: string, rarity: Rarity, points: number, minutes: number): RewardRule => ({
  label,
  rarity,
  points,
  cooldown: minutes * 60_000,
});
/** Versioned economy. Zero-value entries describe observations, not rewarded achievements. */
export const REWARD_RULES: Record<EventType, RewardRule> = {
  ENTER_WORLD: rule('Entrar al jardín', 'white', 0, 0),
  LEAVE_WORLD: rule('Salir del jardín', 'white', 0, 0),
  DIED: rule('Fin de una vida', 'white', 0, 0),
  DANGER: rule('Estar en peligro', 'white', 0, 0),
  FOOD_FOUND: rule('Descubrir comida', 'white', 1, 3),
  FOOD_REACHED: rule('Llegar a la comida', 'white', 2, 3),
  FOOD_CONSUMED: rule('Comer', 'blue', 4, 2),
  WATER_DRANK: rule('Beber agua', 'white', 2, 2),
  FLY_ENCOUNTER: rule('Encontrar otra mosca', 'blue', 4, 2),
  LONG_INTERACTION: rule('Compartir un rato con una mosca o flor', 'blue', 6, 10),
  NEW_AREA: rule('Descubrir una zona', 'yellow', 15, 10),
  HUNTER_ESCAPE: rule('Sobrevivir a un intento del cazador', 'blue', 5, 2),
  RETURN_TO_LOCATION: rule('Volver a un lugar', 'white', 1, 10),
  GROOMED: rule('Completar una limpieza', 'white', 1, 1),
  TOOK_OFF: rule('Despegar', 'white', 2, 1),
  LANDED: rule('Aterrizar', 'white', 2, 1),
  FLEW_TO_AREA: rule('Llegar volando a una zona', 'yellow', 15, 10),
  FOLLOWED_FLY: rule('Acompañar a otra mosca', 'yellow', 20, 5),
  AVOIDED_FLY: rule('Esquivar otra mosca', 'white', 1, 3),
  REACTED_TO_STIMULUS: rule('Responder a un estímulo', 'white', 1, 2),
  RESTED: rule('Descansar', 'white', 1, 3),
};
export const POINTS_POLICY = {
  version: 1,
  minutePoints: 1,
  dailyActionCap: 300,
  presenceGap: 25_000,
} as const;
export interface PointEntry {
  id: string;
  userId: string;
  at: number;
  amount: number;
  rarity: Rarity;
  source: 'presence' | 'action' | 'milestone' | 'purchase';
  purchase?: import('./shop').Purchase;
  code: string;
  label: string;
  flyId?: string;
  eventId?: string;
  version: number;
}
export interface PointProgress {
  foods: string[];
  grooming: string[];
  areas: string[];
  friends: string[];
}
export interface PointAccount {
  since: number;
  presenceMs: number;
  progress: Record<string, PointProgress>;
}
/** Small live wallet update carried by the already-open garden socket. */
export interface PointsLive {
  balance: number;
  presencePoints: number;
  actionPoints: number;
  minuteProgress: number;
}
export interface PointsSummary {
  balance: number;
  totalEarned: number;
  presencePoints: number;
  actionPoints: number;
  minuteProgress: number;
  dailyActionPoints: number;
  dailyActionCap: number;
  since: number;
  rarities: Record<Rarity, number>;
  history: { entries: PointEntry[]; page: number; total: number; pageSize: number };
  milestones: {
    code: string;
    label: string;
    description: string;
    points: number;
    earned: boolean;
    progress: number;
    goal: number;
  }[];
}
