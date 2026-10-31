import { Link, useNavigate } from 'react-router-dom';

import { Seo } from '../../components/Seo';

import { ProductForm } from './ProductForm';

export function ProductNew() {
  const navigate = useNavigate();
  return (
    <section aria-labelledby="product-new-heading">
      <Seo title="New product" noindex />
      <Link to="/admin/products" className="text-sm font-semibold text-primary-strong underline">
        Back to products
      </Link>
      <h2 id="product-new-heading" className="mt-2 font-display text-xl font-bold">
        New product
      </h2>
      <div className="mt-4">
        {/* After creating, land on the edit page: that is where variants, stock and images are
            managed from now on. */}
        <ProductForm onSaved={(saved) => navigate(`/admin/products/${saved.id}`)} />
      </div>
    </section>
  );
}
