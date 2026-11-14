import type { SVGProps } from 'react';

import type { PetIcon } from '../lib/pets';

// Small inline SVG icons. They are decorative (`aria-hidden`): the control that contains one
// always carries its own text or aria-label. Inline SVG avoids an icon font and extra requests.
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);
export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2.5l2.2 10.2a1 1 0 0 0 1 .8h8.1a1 1 0 0 0 1-.8L19.5 8H6.2" />
    <circle cx="9.5" cy="19" r="1.3" />
    <circle cx="17" cy="19" r="1.3" />
  </Svg>
);
export const HeartIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.2-3.6 4.2-5 8-5s6.8 1.4 8 5" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

const DogIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9c-1.5 0-2.5 1.5-2 4 .3 1.600 1.600 2 2.500 1.500M19 9c1.500 0 2.500 1.500 2 4-.3 1.600-1.600 2-2.500 1.500" />
    <path d="M7 6c1-1 2.800-1.500 5-1.500S16 5 17 6c1 1.500 1.500 3 1.500 5.500 0 4-2.700 7-6.500 7s-6.500-3-6.500-7C5.500 9 6 7.500 7 6z" />
    <circle cx="9.500" cy="11" r=".6" fill="currentColor" />
    <circle cx="14.500" cy="11" r=".6" fill="currentColor" />
    <path d="M10.500 14.500h3l-1.500 1.500z" fill="currentColor" />
  </Svg>
);
const CatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4l3.500 3.200C9.600 6.800 10.800 6.600 12 6.600s2.400.2 3.500.6L19 4c.6 2 .8 3.800.5 5.500 1 1.200 1.500 2.600 1.500 4 0 3.600-3.800 6-9 6s-9-2.400-9-6c0-1.400.5-2.800 1.500-4C4.200 7.800 4.400 6 5 4z" />
    <circle cx="9" cy="12.500" r=".6" fill="currentColor" />
    <circle cx="15" cy="12.500" r=".6" fill="currentColor" />
    <path d="M11 15.500h2M12 15.500v1M3 15l3 .5M21 15l-3 .5" />
  </Svg>
);
const BirdIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 8c0 5.500-3.800 10-9 10-3.500 0-6-2-6-5 0-2.500 2-4 4-4h1c0-2.800 2-5 4.500-5 1.600 0 2.800.8 3.500 2h2z" />
    <path d="M18 8l3 1-3 1" fill="currentColor" />
    <circle cx="15.500" cy="8" r=".7" fill="currentColor" />
    <path d="M8 18l-1.500 3M12 18l.5 3" />
  </Svg>
);
const FishIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12c2.500-4.500 6.500-6 10-6 3 0 5.500 2.600 6.500 6-1 3.400-3.500 6-6.500 6-3.500 0-7.500-1.500-10-6z" />
    <path d="M19.500 12L22 8.500v7z" />
    <circle cx="8.500" cy="11" r=".7" fill="currentColor" />
    <path d="M12.500 8.500c1 2.200 1 4.800 0 7" />
  </Svg>
);
const RabbitIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.500 10C7 7 7 3 9 3c1.800 0 2.200 4 2 7M15.500 10c1.500-3 1.500-7-.5-7-1.800 0-2.200 4-2 7" />
    <path d="M12 9c-3.500 0-6 2.500-6 6 0 3 2.500 5.500 6 5.500s6-2.500 6-5.500c0-3.500-2.500-6-6-6z" />
    <circle cx="9.800" cy="14" r=".7" fill="currentColor" />
    <circle cx="14.200" cy="14" r=".7" fill="currentColor" />
    <path d="M11 16.500h2l-1 1z" fill="currentColor" />
  </Svg>
);

const LizardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17c3 0 4-3 6-3h6c2.500 0 3-2 3-4 0-1.500 1-2.500 2.500-2.500" />
    <path d="M9 14l-1.500 3.500M15 14l1.500 3.500M9 14L7 11M15 14l2-3" />
    <circle cx="20" cy="7.500" r=".7" fill="currentColor" />
    <path d="M3 17c-.8.8-.8 2 0 2.500" />
  </Svg>
);

const petIcons: Record<PetIcon, (p: IconProps) => React.JSX.Element> = {
  dog: DogIcon,
  cat: CatIcon,
  bird: BirdIcon,
  fish: FishIcon,
  rabbit: RabbitIcon,
  lizard: LizardIcon,
};

export function PetGlyph({ icon, ...rest }: IconProps & { icon: PetIcon }) {
  const Icon = petIcons[icon];
  return <Icon {...rest} />;
}
