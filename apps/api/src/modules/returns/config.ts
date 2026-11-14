export interface ReturnsConfig {
  /** Days after delivery during which a return can be requested. */
  windowDays: number;
  /**
   * Record the refund as simulated (`sim_...`, no gateway call). True only on a server with no
   * payment gateway and RETURNS_SIMULATED=on (decided in index.ts), never alongside Stripe.
   */
  simulated: boolean;
}

export const DEFAULT_RETURNS_CONFIG: ReturnsConfig = { windowDays: 30, simulated: false };
