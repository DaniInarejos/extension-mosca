import type { Vec3 } from './index';

export const SHOP = {
  dance: {
    label: 'Baile de la mosca',
    description: 'Giros, pasos laterales y alas al ritmo del jardín.',
    price: 15,
    seconds: 12,
    kind: 'fly',
  },
  groom: {
    label: 'Sesión de aseo',
    description: 'Un momento para limpiar patas, antenas y alas.',
    price: 10,
    seconds: 15,
    kind: 'fly',
  },
  acrobatics: {
    label: 'Vuelo acrobático',
    description: 'Una espiral aérea y un aterrizaje suave.',
    price: 30,
    seconds: 24,
    kind: 'fly',
  },
  greet: {
    label: 'Saludar a una amiga',
    description: 'Acércate a una vecina. Ella decide cómo responder.',
    price: 25,
    seconds: 35,
    kind: 'fly',
  },
  drink: {
    label: 'Visitar el estanque',
    description: 'Vuela hasta el agua y bebe si tienes sed.',
    price: 20,
    seconds: 45,
    kind: 'fly',
  },
  eat: {
    label: 'Buscar un bocado',
    description: 'Busca comida disponible y come si tienes hambre.',
    price: 20,
    seconds: 45,
    kind: 'fly',
  },
  explore: {
    label: 'Explorar el jardín',
    description: 'Una excursión hacia una zona poco visitada.',
    price: 25,
    seconds: 35,
    kind: 'fly',
  },
  cursor: {
    label: 'Seguir el cursor',
    description: 'Mueve el puntero sobre el jardín; en móvil, toca un destino.',
    price: 30,
    seconds: 30,
    kind: 'fly',
  },
  petals: {
    label: 'Lluvia de pétalos',
    description: 'Pétalos rosados giran alrededor de tu mosca.',
    price: 100,
    seconds: 40,
    kind: 'garden',
  },
  pollen: {
    label: 'Nube de polen',
    description: 'Una nube dorada atraviesa el jardín.',
    price: 100,
    seconds: 40,
    kind: 'garden',
  },
  wind: {
    label: 'Ráfaga de viento',
    description: 'Se agitan la hierba y las hojas; las moscas sienten la brisa.',
    price: 120,
    seconds: 35,
    kind: 'garden',
  },
  rain: {
    label: 'Llovizna',
    description: 'Lluvia suave y ondas; las moscas buscan refugio.',
    price: 180,
    seconds: 60,
    kind: 'garden',
  },
  fireflies: {
    label: 'Encuentro de luciérnagas',
    description: 'Un crepúsculo temporal con luces junto al estanque.',
    price: 160,
    seconds: 50,
    kind: 'garden',
  },
  bloom: {
    label: 'Floración temporal',
    description: 'Flores nuevas se abren y después se desvanecen.',
    price: 150,
    seconds: 60,
    kind: 'garden',
  },
} as const;
export type ShopCode = keyof typeof SHOP;
export interface Purchase {
  id: string;
  code: ShopCode;
  flyId: string;
  startedAt: number;
  endsAt: number;
  origin: Vec3;
  target: Vec3;
  targetId?: string;
}
export interface ShopState {
  active?: Purchase;
  garden?: Purchase;
  flyReadyAt: number;
  gardenReadyAt: number;
}
export const SHOP_POLICY = { flyCooldown: 45_000, gardenCooldown: 180_000, rewardTail: 30_000 };
