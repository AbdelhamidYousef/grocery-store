import { formatMoney, type Order } from '@store/shared';

// Email clients ignore <style> blocks and external CSS in many cases, so every style is inline and
// the layout is a single-column table-free block that degrades to readable text. Colours are the
// store's brand tokens (apps/web/src/styles/tokens.css) written out, since email cannot read CSS
// variables.
const INK = '#1f1b2e';
const MUTED = '#5b5670';
const BG = '#fff7f0';
const BORDER = '#e6d9cf';
export const PRIMARY = '#d63a1f';

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

export function shell(opts: { preheader: string; heading: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <p style="margin:0 0 16px;font-size:22px;font-weight:bold;color:${PRIMARY};">Pawsome &#128062;</p>
  <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${INK};">${escapeHtml(opts.heading)}</h1>
    ${opts.body}
  </div>
  <p style="margin:16px 0 0;font-size:13px;color:${MUTED};">Pawsome is a fictional demo shop made for a portfolio. Nothing here is real and no card was charged.</p>
</div>
</body>
</html>`;
}

export const paragraph = (html: string): string => `<p style="margin:0 0 12px;">${html}</p>`;

export function itemsTable(order: Order): string {
  const rows = order.items
    .map(
      (i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">${escapeHtml(i.productName)}<br><span style="color:${MUTED};font-size:14px;">${escapeHtml(i.variantName)} &middot; qty ${i.quantity}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid ${BORDER};text-align:right;white-space:nowrap;">${formatMoney(i.lineTotalCents, order.totals.currency)}</td>
    </tr>`,
    )
    .join('');
  const total = (label: string, cents: number, strong = false) =>
    `<tr><td style="padding:4px 0;${strong ? 'font-weight:bold;' : `color:${MUTED};`}">${label}</td><td style="padding:4px 0;text-align:right;${strong ? 'font-weight:bold;' : ''}">${formatMoney(cents, order.totals.currency)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;">
    ${rows}
    ${total('Subtotal', order.totals.subtotalCents)}
    ${total(`Shipping (${escapeHtml(order.shippingMethod.name)})`, order.totals.shippingCents)}
    ${order.totals.discountCents > 0 ? total('Discount', -order.totals.discountCents) : ''}
    ${order.totals.donationCents > 0 ? total('Donation to Whisker Hollow Rescue (demo)', order.totals.donationCents) : ''}
    ${total('Total', order.totals.totalCents, true)}
  </table>`;
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

export function itemsText(order: Order): string {
  const lines = order.items.map(
    (i) =>
      `- ${i.productName} (${i.variantName}) x ${i.quantity}  ${formatMoney(i.lineTotalCents, order.totals.currency)}`,
  );
  return [
    ...lines,
    '',
    `Subtotal: ${formatMoney(order.totals.subtotalCents, order.totals.currency)}`,
    `Shipping (${order.shippingMethod.name}): ${formatMoney(order.totals.shippingCents, order.totals.currency)}`,
    ...(order.totals.discountCents > 0
      ? [`Discount: -${formatMoney(order.totals.discountCents, order.totals.currency)}`]
      : []),
    ...(order.totals.donationCents > 0
      ? [
          `Donation to Whisker Hollow Rescue (demo): ${formatMoney(order.totals.donationCents, order.totals.currency)}`,
        ]
      : []),
    `Total: ${formatMoney(order.totals.totalCents, order.totals.currency)}`,
  ].join('\n');
}
