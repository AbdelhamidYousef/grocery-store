import type { Faq } from '@store/shared';

import { useT } from '../../../i18n';

// Static questions and answers written by the shop. Native <details>/<summary>: keyboard, screen
// reader and find-in-page behaviour come with the element, with nothing to get wrong.
export function FaqAccordion({ faqs }: { faqs: readonly Faq[] }) {
  const { t } = useT();
  if (faqs.length === 0) return null;
  return (
    <section aria-labelledby="faq-heading" data-testid="faq" className="mt-8">
      <h3 id="faq-heading" className="font-display text-xl font-bold">
        {t('pdp.faq.heading')}
      </h3>
      <div className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line">
        {faqs.map((faq) => (
          <details key={faq.id} className="group">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 font-semibold marker:content-none">
              <span className="min-w-0 break-words">{faq.question}</span>
              <span aria-hidden="true" className="shrink-0 text-xl group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="px-4 pb-4 text-muted">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// schema.org FAQPage for the Seo component: the same questions and answers the page shows.
export function faqJsonLd(faqs: readonly Faq[]): Record<string, unknown> | undefined {
  if (faqs.length === 0) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
