import { formatMoney } from '@store/shared';

import { TEST_IDS } from '../../../lib/test-ids';

interface Point {
  bucket: string;
  revenueCents: number;
}

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 12 };

// A hand-rolled SVG line (no chart library, by decision). It scales to the container
// (`viewBox` + `w-full`), draws a baseline at 0, labels the first and last bucket, and exposes a
// text alternative: the whole series as a list for screen readers, since a picture of a line
// says nothing to them. All numbers stay integer cents; only the pixel positions are fractional.
export function RevenueChart({ points, currency }: { points: Point[]; currency: string }) {
  const max = Math.max(1, ...points.map((p) => p.revenueCents));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (cents: number) => PAD.top + innerH - (cents * innerH) / max;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.revenueCents).toFixed(1)}`)
    .join(' ');
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure data-testid={TEST_IDS.analyticsChart} className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Revenue per ${points.length > 31 ? 'week' : 'day'}, highest ${formatMoney(max, currency)}`}
        className="h-auto w-full"
      >
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--color-border)"
          strokeWidth="2"
        />
        {points.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={p.bucket}
            cx={x(i)}
            cy={y(p.revenueCents)}
            r={points.length > 31 ? 2.5 : 3.5}
            fill="var(--color-primary)"
          >
            <title>{`${p.bucket}: ${formatMoney(p.revenueCents, currency)}`}</title>
          </circle>
        ))}
        {first && (
          <text x={PAD.left} y={H - 8} fontSize="12" fill="var(--color-muted)">
            {first.bucket}
          </text>
        )}
        {last && last !== first && (
          <text
            x={W - PAD.right}
            y={H - 8}
            fontSize="12"
            textAnchor="end"
            fill="var(--color-muted)"
          >
            {last.bucket}
          </text>
        )}
      </svg>
      <figcaption className="sr-only">
        <ul>
          {points.map((p) => (
            <li key={p.bucket}>
              {p.bucket}: {formatMoney(p.revenueCents, currency)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
