import { Route, Routes } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AccountLayout } from '../features/account/AccountLayout';
import { AddressesSection } from '../features/account/AddressesSection';
import { OrdersSection } from '../features/account/OrdersSection';
import { ProfileSection } from '../features/account/ProfileSection';
import { SecuritySection } from '../features/account/SecuritySection';

// One lazy chunk for the whole account area, with its own small route table underneath
// (`account/*` in routes.tsx). The guard that keeps visitors out wraps this route there.
export default function AccountPage() {
  return (
    <Routes>
      <Route element={<AccountLayout />}>
        <Route index element={<ProfileSection />} />
        <Route path="security" element={<SecuritySection />} />
        <Route path="addresses" element={<AddressesSection />} />
        <Route path="orders" element={<OrdersSection />} />
        {/* Order detail arrives with phase 9. */}
        <Route path="*" element={<AccountNotFound />} />
      </Route>
    </Routes>
  );
}

function AccountNotFound() {
  return (
    <section data-testid="account-not-found">
      <Seo title="Not found" noindex />
      <h2 className="font-display text-2xl font-bold">We can&apos;t find that page</h2>
      <p className="mt-2 text-muted">Use the menu to pick a section of your account.</p>
    </section>
  );
}
