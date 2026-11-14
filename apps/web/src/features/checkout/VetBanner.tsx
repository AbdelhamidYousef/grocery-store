import { TEST_IDS } from '../../lib/test-ids';

// On the product page of an item that needs a vet's approval. Plain words, no claims about what
// the item does: it only explains that the order waits for a decision, and that it is a demo.
export function VetBanner() {
  return (
    <p
      role="note"
      data-testid={TEST_IDS.vetBanner}
      className="rounded-control border-2 border-pet bg-pet-soft p-3 text-sm"
    >
      <strong>Needs a vet&apos;s okay.</strong> After you pay, we hold this order until a vet
      approves it, then pack it. Demo shop: this is not real medicine and no vet is contacted.
    </p>
  );
}
