import { useSearchParams } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { ProductListing } from '../features/catalog/ProductListing';
import { useT } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';

export default function SearchPage() {
  const { t } = useT();
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() || undefined;

  return (
    <Container className="py-6" data-testid={TEST_IDS.pageSearch}>
      {/* Search results are infinite and duplicate the catalogue: keep them out of the index. */}
      <Seo title={q ? t('search.page.titleFor', { query: q }) : t('search.page.title')} noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {q ? t('search.page.resultsFor', { query: q }) : t('search.page.title')}
      </h1>
      {q ? (
        <div className="mt-6">
          <ProductListing listId="search" q={q} />
        </div>
      ) : (
        <p className="mt-3 text-muted">{t('search.page.prompt')}</p>
      )}
    </Container>
  );
}
