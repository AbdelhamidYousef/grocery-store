import { Link, useParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';

import { ProductForm } from './ProductForm';
import { ProductMerchandising } from './ProductMerchandising';
import { useAdminProduct } from './queries';
import { VariantsSection } from './VariantsSection';

export function ProductEdit() {
  const { id } = useParams();
  const { data: product, isPending, error, refetch } = useAdminProduct(id);

  if (isPending && !error) return <Skeleton className="h-64 w-full rounded-card" />;
  if (error || !product) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div role="alert" data-testid="admin-product-missing">
        <Seo title="Product not found" noindex />
        <p className="font-semibold text-danger">
          {missing ? 'That product does not exist.' : 'We could not load this product.'}
        </p>
        {!missing && (
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
        <Link
          to="/admin/products"
          className="mt-2 block font-semibold text-primary-strong underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="product-edit-heading" className="flex flex-col gap-8">
      <Seo title={`Edit ${product.name}`} noindex />
      <div>
        <Link to="/admin/products" className="text-sm font-semibold text-primary-strong underline">
          Back to products
        </Link>
        <h2 id="product-edit-heading" className="mt-2 break-words font-display text-xl font-bold">
          {product.name}
        </h2>
        {product.status === 'active' && (
          <Link
            to={`/products/${product.slug}`}
            className="text-sm font-semibold text-primary-strong underline"
          >
            View in the shop
          </Link>
        )}
      </div>
      {/* Keyed by id so moving between products always starts a fresh form. */}
      <ProductForm key={product.id} product={product} onSaved={() => undefined} />
      <ProductMerchandising key={`merch-${product.id}-${product.updatedAt}`} product={product} />
      <VariantsSection product={product} />
    </section>
  );
}
