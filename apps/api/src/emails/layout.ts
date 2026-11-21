import { formatClock, formatSlotDate, formatSlotRange, type Order } from '@store/shared';

import type { EmailText } from './i18n/index.ts';

// Email clients ignore <style> blocks and external CSS in many cases, so every style is inline and
// the layout is a single-column table-free block that degrades to readable text. Colours are the
// store's brand tokens (apps/web/src/styles/tokens.css) written out, since email cannot read CSS
// variables.
const INK = '#13221a';
const MUTED = '#4f5f55';
const BG = '#f6faf5';
const BORDER = '#d9e6dc';
export const PRIMARY = '#0f7a3d';

export interface Email {
  subject: string;
  text: string;
  html: string;
}

// Names, addresses and notes come from customers: anything interpolated into HTML is escaped.
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// A dictionary string for HTML: every value is escaped, and the named ones are wrapped in <strong>.
// The string itself is trusted (it is ours); only the values (names, numbers, notes) are not.
export function htmlOf(
  x: EmailText,
  key: Parameters<EmailText['t']>[0],
  params: Record<string, string | number> = {},
  bold: readonly string[] = [],
): string {
  const safe = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      bold.includes(k) ? `<strong>${escapeHtml(String(v))}</strong>` : escapeHtml(String(v)),
    ]),
  );
  return x.t(key, safe);
}

export function shell(
  x: EmailText,
  opts: { preheader: string; heading: string; body: string },
): string {
  return `<!doctype html>
<html lang="${x.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <p style="margin:0 0 16px;font-size:22px;font-weight:bold;color:${PRIMARY};">Grocery</p>
  <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${INK};">${escapeHtml(opts.heading)}</h1>
    ${opts.body}
  </div>
  <p style="margin:16px 0 0;font-size:13px;color:${MUTED};">${escapeHtml(x.t('mail.footer'))}</p>
</div>
</body>
</html>`;
}

export const paragraph = (html: string): string => `<p style="margin:0 0 12px;">${html}</p>`;

export const button = (href: string, label: string): string =>
  `<p style="margin:0 0 16px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(label)}</a></p>`;

export function itemsTable(order: Order, x: EmailText): string {
  const money = (cents: number) => x.money(cents, order.totals.currency);
  // A replacement the shopper rejected is not part of what they bought.
  const rows = order.items
    .filter((i) => i.swapStatus !== 'rejected')
    .map(
      (i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">${escapeHtml(i.productName)}<br><span style="color:${MUTED};font-size:14px;">${escapeHtml(i.variantName)} &middot; ${escapeHtml(x.t('order.qty', { quantity: i.quantity }))}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid ${BORDER};text-align:right;white-space:nowrap;">${money(i.lineTotalCents)}</td>
    </tr>`,
    )
    .join('');
  const total = (label: string, cents: number, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? 'font-weight:bold;' : `color:${MUTED};`}">${label}</td><td style="padding:4px 0;text-align:right;${strong ? 'font-weight:bold;' : ''}">${money(cents)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;">
    ${rows}
    ${total(escapeHtml(x.t('order.subtotal')), order.totals.subtotalCents)}
    ${order.totals.discountCents > 0 ? total(escapeHtml(x.t('order.discount')), -order.totals.discountCents) : ''}
    ${order.totals.depositCents > 0 ? total(escapeHtml(x.t('order.deposit')), order.totals.depositCents) : ''}
    ${order.totals.bagFeeCents > 0 ? total(escapeHtml(x.t('order.bags')), order.totals.bagFeeCents) : ''}
    <tr><td style="padding:4px 0;color:${MUTED};">${escapeHtml(x.t('order.shipping'))}</td><td style="padding:4px 0;text-align:right;">${order.totals.shippingCents === 0 ? escapeHtml(x.t('order.free')) : money(order.totals.shippingCents)}</td></tr>
    ${order.totals.donationCents > 0 ? total(escapeHtml(x.t('order.donation')), order.totals.donationCents) : ''}
    ${total(escapeHtml(x.t('order.total')), order.totals.totalCents, true)}
  </table>`;
}

/**
 * The promised window in words ("Arrives Mon, 23 Nov 14:00–15:00", "Express, by 14:30"), in the
 * shop's time zone and the email's language; null for an order from before delivery slots.
 */
export function deliveryLine(order: Order, x: EmailText): string | null {
  const d = order.delivery;
  if (!d) return null;
  const from = new Date(d.from);
  const to = new Date(d.to);
  if (d.kind === 'express') return x.t('order.arrivesExpress', { time: formatClock(to) });
  return x.t('order.arrives', {
    when: `${formatSlotDate(from, x.locale)} ${formatSlotRange(from, to)}`,
  });
}

/** The delivery time as a block of the HTML email, or an empty string when there is none. */
export function deliveryBlock(order: Order, x: EmailText): string {
  const line = deliveryLine(order, x);
  return line
    ? `<p style="margin:0 0 16px;"><strong>${escapeHtml(x.t('order.deliveryTime'))}</strong><br>${escapeHtml(line)}</p>`
    : '';
}

export function addressLines(a: Order['shippingAddress']): string[] {
  return [
    a.fullName,
    a.line1,
    ...(a.line2 ? [a.line2] : []),
    `${a.postalCode} ${a.city}${a.region ? `, ${a.region}` : ''}`,
    a.country,
  ];
}

export function itemsText(order: Order, x: EmailText): string {
  const money = (cents: number) => x.money(cents, order.totals.currency);
  const lines = order.items
    .filter((i) => i.swapStatus !== 'rejected')
    .map(
      (i) => `- ${i.productName} (${i.variantName}) x ${i.quantity}  ${money(i.lineTotalCents)}`,
    );
  return [
    ...lines,
    '',
    `${x.t('order.subtotal')}${x.colon}${money(order.totals.subtotalCents)}`,
    ...(order.totals.discountCents > 0
      ? [`${x.t('order.discount')}${x.colon}-${money(order.totals.discountCents)}`]
      : []),
    ...(order.totals.depositCents > 0
      ? [`${x.t('order.deposit')}${x.colon}${money(order.totals.depositCents)}`]
      : []),
    ...(order.totals.bagFeeCents > 0
      ? [`${x.t('order.bags')}${x.colon}${money(order.totals.bagFeeCents)}`]
      : []),
    `${x.t('order.shipping')}${x.colon}${order.totals.shippingCents === 0 ? x.t('order.free') : money(order.totals.shippingCents)}`,
    ...(order.totals.donationCents > 0
      ? [`${x.t('order.donation')}${x.colon}${money(order.totals.donationCents)}`]
      : []),
    `${x.t('order.total')}${x.colon}${money(order.totals.totalCents)}`,
  ].join('\n');
}
