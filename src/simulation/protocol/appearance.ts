export const FLY_COLOR_IDS = [
  'natural',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'black',
  'white',
  'pink',
  'peach',
  'coral',
  'mint',
  'pistachio',
  'sky',
  'lavender',
  'lilac',
  'cream',
] as const;
export type FlyColor = (typeof FLY_COLOR_IDS)[number];
export interface FlyAppearance {
  eyes: FlyColor;
  body: FlyColor;
  wings: FlyColor;
}
export type FlyAppearancePart = keyof FlyAppearance;
export const DEFAULT_APPEARANCE: Readonly<FlyAppearance> = {
  eyes: 'natural',
  body: 'natural',
  wings: 'natural',
};
export const FLY_PALETTE: Record<FlyColor, { label: string; hex: string }> = {
  natural: { label: 'Natural', hex: '#414c38' },
  red: { label: 'Rojo', hex: '#c85149' },
  orange: { label: 'Naranja', hex: '#d68c3b' },
  yellow: { label: 'Amarillo', hex: '#d6b447' },
  green: { label: 'Verde', hex: '#598557' },
  blue: { label: 'Azul', hex: '#527fbc' },
  purple: { label: 'Violeta', hex: '#9671ad' },
  black: { label: 'Negro', hex: '#30353a' },
  white: { label: 'Blanco', hex: '#e8e7de' },
  pink: { label: 'Rosa pastel', hex: '#f3a6c8' },
  peach: { label: 'Melocotón', hex: '#f5b895' },
  coral: { label: 'Coral pastel', hex: '#f09a91' },
  mint: { label: 'Menta', hex: '#9fd8b4' },
  pistachio: { label: 'Pistacho', hex: '#c7d99b' },
  sky: { label: 'Celeste', hex: '#9ecae8' },
  lavender: { label: 'Lavanda', hex: '#c1afe8' },
  lilac: { label: 'Lila pastel', hex: '#d5a8dc' },
  cream: { label: 'Crema', hex: '#f3dfae' },
};
const naturalColors: Record<FlyAppearancePart, string> = {
  eyes: '#a36245',
  body: '#414c38',
  wings: '#e6ede0',
};
export function flyColorHex(part: FlyAppearancePart, color: FlyColor) {
  return color === 'natural' ? naturalColors[part] : FLY_PALETTE[color].hex;
}
