import type { ReactNode } from 'react';

export type IconName =
  | 'star'
  | 'eye'
  | 'eye-off'
  | 'pin'
  | 'clock'
  | 'filter'
  | 'plate'
  | 'people'
  | 'user'
  | 'check'
  | 'chevron-down'
  | 'close'
  | 'arrow-left'
  | 'arrow-right'
  | 'reset'
  | 'locate';

/** Hand-drawn 24×24 icons, 1.5 px stroke, round caps. */
const PATHS: Record<IconName, ReactNode> = {
  star: <path d="M12 3.4l2.6 5.5 6 .7-4.4 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.4 9.6l6-.7L12 3.4Z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M2.5 12S6 5.8 12 5.8c1.3 0 2.5.3 3.6.8M21.5 12s-1.4 2.5-3.8 4.3M9.2 18c.9.2 1.8.2 2.8.2" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" />
      <path d="M4 4l16 16" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.8" />
    </>
  ),
  filter: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.2" r="3" />
      <path d="M3.5 19c0-3.1 2.4-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M16.3 14.2c2.6 0 4.7 1.7 4.7 4.3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.7 3.1-6 7-6s7 2.3 7 6" />
    </>
  ),
  check: <path d="M5 12.6l4.4 4.4L19 7.6" />,
  'chevron-down': <path d="M6 9.5l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'arrow-left': <path d="M19 12H5.5M11 6l-6 6 6 6" />,
  'arrow-right': <path d="M5 12h13.5M13 6l6 6-6 6" />,
  reset: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  /** Fills the shape with currentColor (used for selected stars). */
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 20, filled = false, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
