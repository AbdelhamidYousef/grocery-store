import { useParams } from 'react-router-dom';

import { PETS } from '../lib/pets';

import { PagePlaceholder } from './PagePlaceholder';

export default function CategoryPage() {
  const { slug } = useParams();
  const pet = PETS.find((p) => p.slug === slug);
  return (
    // data-pet here is what the real category page (phase 5.3) will do to theme itself.
    <div data-pet={pet?.accent}>
      <PagePlaceholder
        title={pet?.name ?? slug ?? 'Category'}
        note="The product listing arrives in phase 5.3."
        testId="page-category"
      />
    </div>
  );
}
