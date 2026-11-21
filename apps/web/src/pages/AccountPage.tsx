import { Route, Routes } from 'react-router-dom';

import { Seo } from '../components/Seo';
import { AccountLayout } from '../features/account/AccountLayout';
import { AddressesSection } from '../features/account/AddressesSection';
import { OrderDetail } from '../features/account/OrderDetail';
import { OrdersSection } from '../features/account/OrdersSection';
import { ProfileSection } from '../features/account/ProfileSection';
import { SecuritySection } from '../features/account/SecuritySection';
import { ListsSection } from '../features/lists/ListsSection';
import { RewardsSection } from '../features/loyalty/RewardsSection';
import { BuyAgainSection } from '../features/reorder/BuyAgainSection';
import { useT } from '../i18n';

// One lazy chunk for the whole account area, with its own small route table underneath
// (`account/*` in routes.tsx). The guard that keeps visitors out wraps this route there.
export default function AccountPage() {
  return (
    <Routes>
      <Route element={<AccountLayout />}>
        <Route index element={<ProfileSection />} />
        <Route path="security" element={<SecuritySection />} />
        <Route path="addresses" element={<AddressesSection />} />
        <Route path="rewards" element={<RewardsSection />} />
        <Route path="buy-again" element={<BuyAgainSection />} />
        <Route path="lists" element={<ListsSection />} />
        <Route path="orders" element={<OrdersSection />} />
        <Route path="orders/:number" element={<OrderDetail />} />
        <Route path="*" element={<AccountNotFound />} />
      </Route>
    </Routes>
  );
}

function AccountNotFound() {
  const { t } = useT();
  return (
    <section data-testid="account-not-found">
      <Seo title={t('account.notFound.seoTitle')} noindex />
      <h2 className="font-display text-2xl font-bold">{t('account.notFound.title')}</h2>
      <p className="mt-2 text-muted">{t('account.notFound.body')}</p>
    </section>
  );
}
