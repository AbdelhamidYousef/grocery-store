import { useSearchParams } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { ProductListing } from '../features/catalog/ProductListing';
import { TEST_IDS } from '../lib/test-ids';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() || undefined;

  return (
    <Container className="py-6" data-testid={TEST_IDS.pageSearch}>
      {/* Search results are infinite and duplicate the catalogue: keep them out of the index. */}
      <Seo title={q ? `Search: ${q}` : 'Search'} noindex />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">
        {q ? `Results for "${q}"` : 'Search'}
      </h1>
      {q ? (
        <div className="mt-6">
          <ProductListing listId="search" q={q} petScope="any" />
        </div>
      ) : (
        <p className="mt-3 text-muted">Type what you are looking for in the search box above.</p>
      )}
    </Container>
  );
}
