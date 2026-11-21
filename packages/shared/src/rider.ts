// The rider is simulated (G8): there is no real courier, so where the bag "is" is worked out from
// when it was handed over and the end of the promised window. Pure, the clock is an argument, and
// the tracking page says out loud that it is a demo.

export const RIDE_MINUTES = {
  /** A ride is never shorter than this, even when the window is about to close... */
  min: 10,
  /** ...and never longer than this, even when the window is far away. */
  max: 30,
} as const;

export interface RiderProgress {
  /** When the simulated rider rings the bell. */
  arrivesAt: Date;
  /** 0 at hand-over, 1 on arrival. */
  fraction: number;
  /** Whole minutes left, rounded up; 0 once arrived. */
  minutesAway: number;
  arrived: boolean;
}

const MINUTE = 60_000;

export function riderProgress(dispatchedAt: Date, windowEnd: Date, now: Date): RiderProgress {
  const wanted = (windowEnd.getTime() - dispatchedAt.getTime()) / MINUTE;
  const rideMs = Math.min(RIDE_MINUTES.max, Math.max(RIDE_MINUTES.min, wanted)) * MINUTE;
  const arrivesAt = new Date(dispatchedAt.getTime() + rideMs);
  const elapsed = now.getTime() - dispatchedAt.getTime();
  const fraction = Math.min(1, Math.max(0, elapsed / rideMs));
  const arrived = now.getTime() >= arrivesAt.getTime();
  return {
    arrivesAt,
    fraction,
    minutesAway: arrived ? 0 : Math.ceil((arrivesAt.getTime() - now.getTime()) / MINUTE),
    arrived,
  };
}
