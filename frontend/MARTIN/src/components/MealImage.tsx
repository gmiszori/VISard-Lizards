import { useId, useState, type ReactNode } from 'react';
import type { DietTag, Meal } from '../lib/types';

/**
 * Meal picture. Shows `imageUrl` when the backend has one, otherwise draws a
 * top-down plate from the meal's ingredients. Same meal → same drawing.
 */

type Rnd = () => number;

function seeded(seed: string): Rnd {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spread = (n: number, r: Rnd, radius: number) =>
  Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, rot: r() * 180 };
  });

const CRUMBS = ['#E8C27A', '#D9A859', '#F0D9A0'];

function crumbs(r: Rnd, n = 9, radius = 11) {
  return spread(n, r, radius).map((p, i) => (
    <circle key={i} cx={p.x} cy={p.y} r={0.9 + r() * 0.8} fill={CRUMBS[i % 3]} />
  ));
}

type Drawer = (r: Rnd) => ReactNode;

const FOOD: Record<string, Drawer> = {
  rice: (r) => (
    <>
      <circle r="13" fill="#EFE8D3" />
      {spread(16, r, 12).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx="3.3" ry="1.5" transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="#FBF7EA" stroke="#D9D0B6" strokeWidth=".5" />
      ))}
    </>
  ),
  pasta: () => (
    <>
      {[-9, -3, 3, 9].map((y, i) => (
        <path key={y} d={`M-15 ${y} q5 -7 10 0 t10 0 t10 0`} fill="none" stroke={i % 2 ? '#E7B94A' : '#F0C95C'} strokeWidth="4" strokeLinecap="round" />
      ))}
    </>
  ),
  fries: (r) => (
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x="-2" y="-11" width="4" height="22" rx="1" transform={`rotate(${-36 + i * 9 + (r() - 0.5) * 6})`} fill={i % 2 ? '#EBBB45' : '#E2AC30'} stroke="#C58E1B" strokeWidth=".6" />
      ))}
    </>
  ),
  potato: (r) => (
    <>
      {spread(3, r, 8).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
          <ellipse rx="9" ry="6.5" fill="#E0B97E" stroke="#B38B53" strokeWidth=".8" />
          <circle cx="-2" cy="-1" r="1" fill="#B38B53" />
          <circle cx="3" cy="1.5" r="1" fill="#B38B53" />
        </g>
      ))}
    </>
  ),
  salad: () => (
    <>
      {[0, 60, 120, 180, 240, 300].map((a, i) => (
        <path key={a} d="M0 -3 C 9 -7 9 -17 0 -19 C -9 -17 -9 -7 0 -3Z" transform={`rotate(${a})`} fill={['#6FA05A', '#8DBB6A', '#4F8A4A'][i % 3]} stroke="#3A6B3A" strokeWidth=".6" />
      ))}
      <circle r="3" fill="#B7D58A" />
    </>
  ),
  greens: (r) => (
    <>
      {spread(2, r, 6).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
          <rect x="-1.6" y="0" width="3.2" height="9" fill="#8DB562" />
          {[[-4, -3], [4, -3], [0, -6], [0, 0]].map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r="4.6" fill={j % 2 ? '#3F7A3A' : '#4F8F45'} stroke="#2F5E2F" strokeWidth=".5" />
          ))}
        </g>
      ))}
    </>
  ),
  carrot: (r) => (
    <>
      {spread(6, r, 10).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.2" fill="#EC8A32" stroke="#BF6118" strokeWidth=".7" />
          <circle cx={p.x} cy={p.y} r="1.5" fill="#F7B26A" />
        </g>
      ))}
    </>
  ),
  tomato: (r) => (
    <>
      {spread(2, r, 7).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <circle r="6.5" fill="#D9372B" stroke="#9E2218" strokeWidth=".8" />
          <circle cx="-2" cy="-2" r="1.6" fill="#F28A7E" />
          <path d="M-2.5 -5.5 L0 -3.5 L2.5 -5.5" stroke="#3F7A3A" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  chicken: (r) => (
    <>
      <path d="M-16 -3 C-16 -13 -2 -15 8 -12 C 18 -9 18 4 11 11 C 3 17 -12 14 -16 6Z" fill="#CB8D3C" stroke="#9B6320" strokeWidth="1" />
      {crumbs(r)}
    </>
  ),
  cutlet: (r) => (
    <>
      <path d="M-19 -2 C-19 -14 0 -16 11 -13 C 21 -9 21 5 12 11 C 2 17 -15 15 -19 5Z" fill="#D49A4A" stroke="#A56F27" strokeWidth="1" />
      {crumbs(r, 12, 13)}
    </>
  ),
  steak: () => (
    <>
      <rect x="-17" y="-10" width="34" height="20" rx="8" fill="#7C4932" stroke="#4F2B1D" strokeWidth="1" />
      {[-9, -2, 5].map((x) => (
        <path key={x} d={`M${x} -8 l7 16`} stroke="#3A1F15" strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
      ))}
    </>
  ),
  sausage: () => (
    <>
      {[-7, 5].map((y, i) => (
        <g key={y} transform={`rotate(${i ? 4 : -3})`}>
          <rect x="-16" y={y - 4.5} width="32" height="9" rx="4.5" fill="#A24F36" stroke="#6E2F20" strokeWidth="1" />
          <path d={`M-8 ${y - 3} l2 6 M0 ${y - 3} l2 6 M8 ${y - 3} l2 6`} stroke="#5C2618" strokeWidth="1.2" opacity=".7" />
        </g>
      ))}
    </>
  ),
  fish: () => (
    <>
      <path d="M-17 0 C-9 -11 7 -11 13 -2 L20 -9 L20 9 L13 2 C 7 11 -9 11 -17 0Z" fill="#EE9A74" stroke="#BF6746" strokeWidth="1" />
      <path d="M-8 -4 q4 4 0 8 M-1 -5 q4 5 0 10 M6 -3 q3 3 0 6" fill="none" stroke="#F8C2A6" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  tofu: (r) => (
    <>
      {spread(3, r, 7).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
          <rect x="-6" y="-6" width="12" height="12" rx="2.2" fill="#F3E8C6" stroke="#C9B98A" strokeWidth=".8" />
          <rect x="-4" y="-4" width="8" height="8" rx="1.4" fill="none" stroke="#D9B565" strokeWidth="1" />
        </g>
      ))}
    </>
  ),
  lentils: (r) => (
    <>
      <circle r="13" fill="#9A5A2A" opacity=".5" />
      {spread(24, r, 12).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx="2.2" ry="1.6" transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill={['#B5632E', '#8C4A22', '#D58A3F'][i % 3]} />
      ))}
    </>
  ),
  curry: (r) => (
    <>
      <path d="M-16 0 C-16 -12 -4 -16 6 -13 C 17 -10 18 4 10 11 C 2 16 -14 13 -16 0Z" fill="#DE9A2A" stroke="#B0701A" strokeWidth="1" />
      {spread(6, r, 9).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.6" fill={['#EC8A32', '#6FA05A', '#F7D26A'][i % 3]} stroke="#8A5410" strokeWidth=".4" />
      ))}
    </>
  ),
  egg: () => (
    <>
      <path d="M-14 -2 C-15 -11 -3 -14 4 -12 C 13 -13 17 -4 14 3 C 12 11 2 14 -5 12 C -13 11 -13 5 -14 -2Z" fill="#FCFBF5" stroke="#D3CCB4" strokeWidth="1" />
      <circle cx="0" cy="0" r="5.2" fill="#F2B01E" stroke="#C98A0B" strokeWidth=".7" />
      <circle cx="-1.6" cy="-1.6" r="1.3" fill="#FAD36B" />
    </>
  ),
  bread: () => (
    <>
      <rect x="-15" y="-10" width="30" height="20" rx="8" fill="#DDB473" stroke="#A57A38" strokeWidth="1" />
      <path d="M-9 -6 l18 12" stroke="#B88A45" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="-6" cy="-4" r=".9" fill="#F3E3B8" />
      <circle cx="4" cy="3" r=".9" fill="#F3E3B8" />
      <circle cx="9" cy="-4" r=".9" fill="#F3E3B8" />
    </>
  ),
  cheese: () => (
    <>
      <path d="M-15 8 L-15 -4 L10 -10 L15 8Z" fill="#F4D15E" stroke="#C7A02E" strokeWidth="1" />
      <circle cx="-6" cy="1" r="2.3" fill="#E5B93C" />
      <circle cx="4" cy="-1" r="1.7" fill="#E5B93C" />
      <circle cx="8" cy="4" r="2" fill="#E5B93C" />
    </>
  ),
  falafel: (r) => (
    <>
      {spread(4, r, 8).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <circle r="5.6" fill="#7B5A2E" stroke="#4F3818" strokeWidth=".8" />
          <circle cx="-1.5" cy="-1" r=".9" fill="#A9894F" />
          <circle cx="1.8" cy="1.6" r=".9" fill="#A9894F" />
        </g>
      ))}
    </>
  ),
  sauce: () => (
    <path d="M-12 1 C-13 -8 -3 -11 5 -9 C 13 -8 14 3 8 8 C 2 12 -11 10 -12 1Z" fill="#C8512E" opacity=".9" />
  ),
  dumpling: (r) => (
    <>
      {spread(8, r, 10).map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx="5.2" ry="3.5" transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="#EDDBA9" stroke="#C7B27A" strokeWidth=".7" />
      ))}
    </>
  ),
  mushroom: (r) => (
    <>
      {spread(4, r, 9).map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
          <rect x="-2" y="0" width="4" height="5" fill="#E9DCC2" />
          <path d="M-6.5 1 a6.5 5.5 0 0 1 13 0Z" fill="#B99B78" stroke="#8A6E4E" strokeWidth=".7" />
        </g>
      ))}
    </>
  ),
};

const generic: Drawer = () => <circle r="10" fill="#C9C1AA" stroke="#A39B84" strokeWidth=".8" />;

/** Slots on the plate, centre first. Coordinates in a 120×120 box. */
const SLOTS: Array<Array<[number, number, number]>> = [
  [],
  [[60, 60, 1.35]],
  [[51, 55, 1.15], [77, 70, 0.82]],
  [[49, 52, 1.05], [79, 52, 0.78], [62, 80, 0.85]],
  [[47, 50, 1.0], [78, 49, 0.74], [48, 78, 0.74], [78, 77, 0.78]],
];

const TINT: Record<DietTag, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  meat: 'meat',
  fish: 'meat',
};

type Props = {
  meal: Pick<Meal, 'id' | 'title' | 'imageUrl' | 'ingredients' | 'dietTag'>;
  className?: string;
};

export function MealImage({ meal, className = '' }: Props) {
  const [broken, setBroken] = useState(false);
  const uid = useId().replace(/:/g, '');

  if (meal.imageUrl && !broken) {
    return (
      <div className={`mealimg ${className}`}>
        <img src={meal.imageUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </div>
    );
  }

  const r = seeded(meal.id);
  const items = meal.ingredients.slice(0, 4);
  const slots = SLOTS[Math.max(1, items.length)] ?? SLOTS[1] ?? [];
  // Sauce sits under everything; the main ingredient is drawn last, on top.
  const placed = items.map((key, i) => ({ key, slot: slots[i] as [number, number, number], i }));
  const order = [...placed].sort((a, b) => {
    const rank = (k: string) => (k === 'sauce' ? -1 : 0);
    return rank(a.key) - rank(b.key) || b.i - a.i;
  });

  return (
    <div className={`mealimg plate plate--${TINT[meal.dietTag]} ${className}`} aria-hidden="true">
      <svg className="plate__hatch" width="100%" height="100%" focusable="false">
        <defs>
          <pattern id={`h${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#h${uid})`} />
      </svg>
      <svg className="plate__art" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" focusable="false">
        <circle cx="60" cy="60" r="50" className="plate__shadow" />
        <circle cx="60" cy="60" r="47" className="plate__body" />
        <circle cx="60" cy="60" r="38" className="plate__ring" />
        {order.map(({ key, slot, i }) => {
          const [x, y, s] = slot;
          const jitter = (r() - 0.5) * 3;
          const rot = i === 0 ? (r() - 0.5) * 50 : r() * 360;
          const draw = FOOD[key] ?? generic;
          return (
            <g key={`${key}-${i}`} transform={`translate(${x + jitter} ${y + jitter}) rotate(${rot}) scale(${s})`}>
              {draw(r)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
