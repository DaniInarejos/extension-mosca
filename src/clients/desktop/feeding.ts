import type { FlySnapshot } from '../../core/types';

const svgNamespace = 'http://www.w3.org/2000/svg';
/** Ilustración local compartida por ambas ventanas; nunca interpreta HTML del servidor. */
export function paintFeeding(avatar: SVGElement, fly: FlySnapshot | undefined, active: boolean) {
  if (!avatar.querySelector('.feeding-prop')) {
    const prop = document.createElementNS(svgNamespace, 'g');
    prop.setAttribute('class', 'feeding-prop');
    prop.setAttribute('aria-hidden', 'true');
    prop.setAttribute('transform', 'translate(-30 54)');
    prop.innerHTML = `
      <g class="feeding-fruit">
        <ellipse class="snack-shadow" cx="110" cy="32" rx="15" ry="3" />
        <path class="fruit-skin" d="M110 11 C99 4 93 15 99 25 C103 33 107 30 110 29 C114 32 120 29 123 22 C128 10 119 5 110 11Z" />
        <path class="fruit-shine" d="M101 14 Q98 19 103 23" />
        <path class="fruit-stem" d="M110 12 Q108 6 112 3" />
        <path class="fruit-leaf" d="M111 8 Q115 0 122 4 Q119 11 111 8Z" />
      </g>
      <g class="feeding-water">
        <ellipse class="water-pool" cx="110" cy="24" rx="19" ry="7" />
        <ellipse class="water-ripple" cx="110" cy="24" rx="10" ry="3" />
        <path class="water-glint" d="M97 22 Q100 20 104 21" />
      </g>`;
    const tilt = avatar.querySelector('.fly-tilt')!;
    tilt.insertBefore(prop, tilt.querySelector('.head'));
  }
  avatar.dataset.feeding = active && fly?.pose.behavior === 'FEED' ? fly.feeding ?? 'none' : 'none';
  // Acercar la trompa al alimento, que queda junto a las patas delanteras.
  avatar.querySelector('.proboscis')?.setAttribute('d', avatar.dataset.feeding === 'none'
    ? 'M110 56 Q110 67 106 74'
    : 'M110 56 Q110 76 92 76');
}
