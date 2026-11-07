import { Link } from 'react-router-dom';

// Shared policy copy for every product, plus this product's own note. The numbers (prices, free
// delivery threshold) live on the Shipping page and at checkout, so they cannot drift from here.
export function DeliveryPanel({ note }: { note: string | null }) {
  return (
    <div className="flex max-w-prose flex-col gap-4">
      {note && (
        <p
          data-testid="delivery-note"
          className="rounded-card border-2 border-pet bg-pet-soft p-3 font-semibold"
        >
          {note}
        </p>
      )}
      <section aria-labelledby="delivery-heading">
        <h3 id="delivery-heading" className="font-display text-xl font-bold">
          Delivery
        </h3>
        <p className="mt-1">
          Orders ship from our warehouse on business days. You choose standard or express delivery
          at checkout and see the exact price before you pay. Read the{' '}
          <Link to="/shipping" className="font-semibold text-primary-strong underline">
            shipping page
          </Link>{' '}
          for prices and times.
        </p>
      </section>
      <section aria-labelledby="returns-heading">
        <h3 id="returns-heading" className="font-display text-xl font-bold">
          Returns
        </h3>
        <p className="mt-1">
          Changed your mind? Unused items in their original packaging can be returned within 30
          days. Opened food and hygiene items cannot be returned unless they are faulty. See{' '}
          <Link to="/returns" className="font-semibold text-primary-strong underline">
            returns and withdrawal
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
