import { Route, Routes } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AdminLayout } from '../features/admin/AdminLayout';
import { BrandsAdmin } from '../features/admin/BrandsAdmin';
import { CollectionsAdmin } from '../features/admin/CollectionsAdmin';
import { GuideEdit } from '../features/admin/content/GuideEdit';
import { GuidesList } from '../features/admin/content/GuidesList';
import { HelpAdmin } from '../features/admin/content/HelpAdmin';
import { HomeAdmin } from '../features/admin/content/HomeAdmin';
import { MessagesAdmin } from '../features/admin/content/MessagesAdmin';
import { SafetyEdit } from '../features/admin/content/SafetyEdit';
import { SafetyList } from '../features/admin/content/SafetyList';
import { TestimonialsAdmin } from '../features/admin/content/TestimonialsAdmin';
import { WithdrawalsAdmin } from '../features/admin/content/WithdrawalsAdmin';
import { Dashboard } from '../features/admin/Dashboard';
import { OrderDetail } from '../features/admin/OrderDetail';
import { OrdersList } from '../features/admin/OrdersList';
import { ProductEdit } from '../features/admin/ProductEdit';
import { ProductNew } from '../features/admin/ProductNew';
import { ProductsList } from '../features/admin/ProductsList';
import { TagsAdmin } from '../features/admin/TagsAdmin';

// One lazy chunk for the whole back office, with its own small route table underneath
// (`admin/*` in routes.tsx), like the account area. RequireAdmin wraps this route there.
export default function AdminPage() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<ProductsList />} />
        <Route path="products/new" element={<ProductNew />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="orders" element={<OrdersList />} />
        <Route path="orders/:number" element={<OrderDetail />} />
        <Route path="brands" element={<BrandsAdmin />} />
        <Route path="collections" element={<CollectionsAdmin />} />
        <Route path="tags" element={<TagsAdmin />} />
        <Route path="guides" element={<GuidesList />} />
        <Route path="guides/new" element={<GuideEdit />} />
        <Route path="guides/:id" element={<GuideEdit />} />
        <Route path="help" element={<HelpAdmin />} />
        <Route path="testimonials" element={<TestimonialsAdmin />} />
        <Route path="safety" element={<SafetyList />} />
        <Route path="safety/new" element={<SafetyEdit />} />
        <Route path="safety/:id" element={<SafetyEdit />} />
        <Route path="withdrawals" element={<WithdrawalsAdmin />} />
        <Route path="messages" element={<MessagesAdmin />} />
        <Route path="home" element={<HomeAdmin />} />
        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </Routes>
  );
}

function AdminNotFound() {
  return (
    <section data-testid="admin-not-found">
      <Seo title="Not found" noindex />
      <h2 className="font-display text-xl font-bold">We can&apos;t find that admin page</h2>
      <p className="mt-2 text-muted">Use the menu to pick a section.</p>
    </section>
  );
}
