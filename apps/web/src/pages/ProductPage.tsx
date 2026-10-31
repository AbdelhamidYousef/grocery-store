import { useParams } from 'react-router-dom';

import { PagePlaceholder } from './PagePlaceholder';

export default function ProductPage() {
  const { slug } = useParams();
  return (
    <PagePlaceholder
      title={slug ?? 'Product'}
      note="The product detail page arrives in phase 5.6."
      testId="page-product"
    />
  );
}
