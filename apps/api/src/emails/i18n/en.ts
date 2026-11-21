import type { TextEntry } from '@store/shared';

// English email strings: the source the other languages are typed from (a key missing in de.ts or
// fr.ts fails the typecheck) and the fallback for any language. `{name}` marks a value filled in
// at send time; there is no markup in a string (the template wraps what must be bold or a link).
// Names, notes, admin text and catalogue text are data, not strings here: they are never
// translated by this file.
export const en = {
  // ----- shared -----
  'mail.footer':
    'Grocery is a fictional shop made for a portfolio. Nothing here is real and no card was charged.',
  'mail.signoff': '- The Grocery team',
  'mail.hello': 'Hello {name},',
  'mail.seeOrder': 'See your order',
  'mail.orderLine': 'Order: {url}',

  // ----- order summary (confirmation, shipped) -----
  'order.qty': 'qty {quantity}',
  'order.subtotal': 'Subtotal',
  'order.shipping': 'Delivery',
  'order.free': 'Free',
  'order.deposit': 'Bottle deposit',
  'order.bags': 'Bags',
  'order.discount': 'Discount',
  'order.donation': 'Donation to Spreeufer Food Bank (demo)',
  'order.total': 'Total',
  'order.shippingTo': 'Shipping to:',
  'order.deliveryTime': 'Delivery time',
  'order.arrives': 'Arrives {when}',
  'order.arrivesExpress': 'Express, by {time}',
  'order.deliveringTo': 'Delivering to:',

  // ----- order confirmation -----
  'confirm.subject': 'Your Grocery order {number} is confirmed',
  'confirm.thanks': 'Thank you for your order, {name}.',
  'confirm.paid': 'Order {number} is paid and we are getting it ready.',
  'confirm.willEmail': "We'll email you again when it ships.",
  'confirm.follow': 'Follow your order any time: {url}',
  'confirm.preheader': 'Order {number} is confirmed.',
  'confirm.heading': 'Thank you for your order.',
  'confirm.intro': 'Hi {name}, order {number} is paid and we are getting it ready.',
  'confirm.track': 'Track your order',
  'confirm.trackNote': '(you will need the email address you ordered with).',

  // Manual capture (G6): what is held on the card and what was taken.
  'confirm.held': '{amount} is held on your card and charged when we pack your order.',
  'confirm.heldWeighed':
    'We hold up to {amount} on your card and charge what your bag weighs: the final price comes after weighing.',

  // ----- final bill (after the money is taken) -----
  'bill.subject': 'Your final bill for Grocery order {number}',
  'bill.preheader': 'We took {amount} for order {number}.',
  'bill.heading': 'Your final bill',
  'bill.intro': 'Hi {name}, we packed order {number} and took {amount} from your card.',
  'bill.weighed': 'Weighed: {product}, {grams} g, {price}',
  'bill.held': 'We had held {amount}; the rest of the hold is released.',
  'bill.total': 'Charged',
  'bill.notCharged': 'Not charged: {product} (not in stock).',
  'bill.shortCharged': '{product}: {picked} of {quantity} charged.',
  'bill.swapKept': 'Replacement: {product} x {quantity}, {price}.',
  'bill.swapRejected': 'Replacement rejected: {product}, not charged.',

  // ----- we changed something (a shortfall at packing) -----
  'swaps.subject': 'We changed something in your Grocery order {number}',
  'swaps.preheader': 'Something was not on the shelf. See what changed in order {number}.',
  'swaps.heading': 'We changed something in your order',
  'swaps.intro': 'Hi {name}, we could not find everything for order {number}.',
  'swaps.missing': '{product} is not in stock.',
  'swaps.short': '{product}: we found {picked} of {quantity}.',
  'swaps.notCharged': 'You will not be charged for what is missing.',
  'swaps.replacement':
    'We would like to bring {quantity} x {product} instead, at {price} each. You never pay more than the {original} each of the original.',
  'swaps.accept': 'Accept the replacement',
  'swaps.reject': 'Reject the replacement',
  'swaps.default':
    'If you do not answer before we dispatch your order, we keep the replacement and charge it at the price above.',

  // ----- order shipped -----
  'shipped.subject': 'Your Grocery order {number} is on its way',
  'shipped.good': 'Hi {name}, order {number} is on the way.',
  'shipped.goodSlot': 'Hi {name}, order {number} is on the way, arriving {when}.',
  'shipped.goodExpress': 'Hi {name}, order {number} is on the way, arriving by {time}.',
  'shipped.preheader': 'Order {number} is on the way.',
  'shipped.heading': 'Your order is on the way',
  'shipped.rider': 'Your rider is {rider}. Grocery is a demo shop, so the rider is simulated.',

  // ----- order delivered -----
  'delivered.subject': 'Your Grocery order {number} was delivered',
  'delivered.good': 'Hi {name}, order {number} was delivered.',
  'delivered.preheader': 'Order {number} was delivered.',
  'delivered.heading': 'Your order was delivered',
  'delivered.help': 'Something not right? Write to us and we make it right.',

  // ----- withdrawal -----
  'withdrawal.subject': 'We received your withdrawal for order {number}',
  'withdrawal.body':
    'This email confirms that on {when} we received your statement withdrawing from the contract for order {number}.',
  'withdrawal.reference': 'Reference: {reference}',
  'withdrawal.covers': 'Covers: {scope}',
  'withdrawal.wholeOrder': 'the whole order',
  'withdrawal.reason': 'Reason you gave: {reason}',
  'withdrawal.next': 'We will write again with the next steps. Keep this email as your proof.',
  'withdrawal.preheader': 'Withdrawal for order {number} received.',
  'withdrawal.heading': 'We received your withdrawal',

  // ----- returns -----
  'return.requested.subject': 'We got your return request for order {order}',
  'return.requested.heading': 'We got your return request',
  'return.requested.l1':
    'Thanks, we have your request ({ref}) for order {order}. Someone will look at it soon and email you the next step.',
  'return.requested.l2': 'You asked to return: {list}.',
  'return.approved.subject': 'Your return {ref} is approved',
  'return.approved.heading': 'Your return is approved',
  'return.approved.l1': 'Good news: your return {ref} for order {order} is approved.',
  'return.approved.l2':
    'How to send it back: pack {list} in the original packaging if you can, write {ref} on the package, and post it to Grocery Returns, Lindenstrasse 1, 10115 Berlin (a made-up address: this is a fictional shop).',
  'return.approved.l3':
    'When it arrives and we have checked it, we refund you and send another email.',
  'return.rejected.subject': 'About your return {ref}',
  'return.rejected.heading': 'We could not accept this return',
  'return.rejected.l1': 'We are sorry: we could not accept return {ref} for order {order}.',
  'return.rejected.reason': 'Reason: {reason}',
  'return.rejected.noReason': 'Write to us if you would like to know more.',
  'return.received.subject': 'We received your return {ref}',
  'return.received.heading': 'Your return arrived',
  'return.received.l1': 'Your return {ref} for order {order} has arrived: {list}.',
  'return.received.l2':
    'We are preparing your refund of {money}. You will get one more email when it is sent.',
  'return.refunded.subject': 'Your refund of {money} is on its way',
  'return.refunded.heading': 'Your refund is on its way',
  'return.refunded.l1': 'We refunded {money} for return {ref} (order {order}).',
  'return.refunded.simulated': 'This is a demo shop: the refund was simulated and no money moved.',
  'return.refunded.real':
    'It usually shows up on your card within a few days, depending on your bank.',

  // ----- newsletter -----
  'news.unsub.text':
    'You get this because you subscribed to Grocery news. Unsubscribe with one click: {url}',
  'news.unsub.lead': 'You get this because you subscribed to Grocery news.',
  'news.unsub.link': 'Unsubscribe with one click',
  'news.confirm.subject': 'Confirm your Grocery subscription',
  'news.confirm.l1': 'One more step: please confirm that you want Grocery news and offers.',
  'news.confirm.link': 'Confirm: {url}',
  'news.confirm.button': 'Yes, subscribe me',
  'news.confirm.hours': {
    one: 'The link works for {count} hour. If you did not ask for this, ignore this email and nothing will be sent to you.',
    other:
      'The link works for {count} hours. If you did not ask for this, ignore this email and nothing will be sent to you.',
  },
  'news.confirm.preheader': 'Confirm your address to get your welcome code',
  'news.confirm.heading': 'Confirm your subscription',
  'news.welcome.subject': 'Welcome to Grocery: {percent}% off your first order',
  'news.welcome.l1': 'You are in. Thank you for subscribing.',
  'news.welcome.code': 'Your welcome code: {code}',
  'news.welcome.terms': {
    one: '{percent}% off your first order, one use, valid for {count} day.',
    other: '{percent}% off your first order, one use, valid for {count} days.',
  },
  'news.welcome.enter': 'Enter it in the cart.',
  'news.welcome.preheader': 'Your {percent}% welcome code is inside',
  'news.welcome.heading': 'Welcome to the pack',

  // ----- stock alert -----
  'stock.subject': 'Back in stock: {product}',
  'stock.l1': 'Good news: {product} ({variant}) is back in stock.',
  'stock.look': 'Take a look: {url}',
  'stock.button': 'See it in the shop',
  'stock.hurry': 'Stock can go quickly, so we cannot hold one for you.',
  'stock.once': 'You asked us for this one email.',
  'stock.cancel': 'Not interested any more?',
  'stock.preheader': '{product} is back',
  'stock.heading': 'It is back in stock',

  // ----- contact -----
  'contact.topic.order': 'My order',
  'contact.topic.shipping': 'Shipping and delivery',
  'contact.topic.returns': 'Returns and refunds',
  'contact.topic.product': 'A product',
  'contact.topic.account': 'My account',
  'contact.topic.privacy': 'My data and privacy',
  'contact.topic.other': 'Something else',
  'contact.ack.subject': 'We got your message ({reference})',
  'contact.ack.l1':
    'Thank you for writing to Grocery. A person will reply to this address, usually within two working days.',
  'contact.ack.reference': 'Reference: {reference}',
  'contact.ack.topic': 'Topic: {topic}',
  'contact.ack.order': 'Order: {order}',
  'contact.ack.yourMessage': 'Your message:',
  'contact.ack.preheader': 'We received your message.',
  'contact.ack.heading': 'We got your message',

  // ----- product safety notice, review approved -----
  'safety.recall': 'Product recall: {title}',
  'safety.notice': 'Product safety notice: {title}',
  'safety.reason': 'You are receiving this because you bought an affected product from Grocery.',
  'review.subject': 'Your review of {product} is live',
  'review.l1':
    'Thank you for reviewing {product}. Your review has passed our check and is now on the product page, where it helps other shoppers choose.',
  'review.see': 'See it here: {url}',
  'review.link': 'See your review',
  'review.preheader': 'Your review of {product} is live.',
  'review.heading': 'Thank you for your review.',
} as const satisfies Record<string, TextEntry>;

export type EmailKey = keyof typeof en;
