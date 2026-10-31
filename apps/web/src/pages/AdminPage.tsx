import { Route, Routes } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AdminLayout } from '../features/admin/AdminLayout';
import { Dashboard } from '../features/admin/Dashboard';

// One lazy chunk for the whole back office, with its own small route table underneath
// (`admin/*` in routes.tsx), like the account area. RequireAdmin wraps this route there.
export default function AdminPage() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
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
