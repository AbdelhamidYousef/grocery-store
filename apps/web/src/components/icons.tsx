import type { DepartmentIcon } from '@store/shared';
import type { SVGProps } from 'react';

import { DEPARTMENT_ICON_PATHS } from '../lib/department-icons';

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

// One glyph per department, drawn from the paths in lib/department-icons.ts (the same data the
// product placeholder pictures are made from).
export function DepartmentGlyph({ icon, ...rest }: IconProps & { icon: DepartmentIcon }) {
  return (
    <Svg {...rest}>
      {DEPARTMENT_ICON_PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </Svg>
  );
}
