import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { MarkdownBody } from '../guides/MarkdownBody';

import type { LegalPageDef } from './pages';

// One component for every static page: the Markdown is the copy, this is the frame. The notice
// is part of the frame (not of each file) so no page can lose it when its text is rewritten.
export function LegalPage({ page }: { page: LegalPageDef }) {
  const { t } = useT();
  const title = t(page.titleKey);
  return (
    <Container className="py-8" data-testid={TEST_IDS.pageLegal}>
      <Seo title={title} description={t(page.descriptionKey)} />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
      <p
        className="mt-3 max-w-prose rounded-control border-2 border-line bg-primary-soft p-3 text-sm font-semibold"
        data-testid={TEST_IDS.demoNotice}
      >
        {t('content.legal.notice')}
      </p>
      <div className="mt-6">
        <MarkdownBody source={page.body} />
      </div>
    </Container>
  );
}
