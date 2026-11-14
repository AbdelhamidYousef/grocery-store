import { MobileMenu } from '../../features/navigation/MobileMenu';
import { PetChoices } from '../../features/pets/PetSwitcher';
import { useT } from '../../i18n';
import { Dialog } from '../ui/Dialog';

import { SearchBox } from './SearchBox';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

// The drawer is a modal <dialog> (see ui/Dialog): focus is trapped, Escape closes, and focus
// returns to the menu button. Choosing a link closes it, otherwise it would sit over the new page.
export function MobileNav({ open, onClose }: MobileNavProps) {
  const { t } = useT();
  return (
    <Dialog open={open} onClose={onClose} title={t('shell.menu')} placement="left">
      <SearchBox idPrefix="drawer" onSearch={onClose} />
      <nav aria-label={t('shell.shopByPet')} data-testid="mobile-nav">
        <MobileMenu onNavigate={onClose} />
      </nav>
      <section aria-labelledby="drawer-pets" data-testid="mobile-pets">
        <p id="drawer-pets" className="mb-1 font-display text-lg font-bold">
          {t('shell.shoppingFor')}
        </p>
        <PetChoices onPick={onClose} />
      </section>
    </Dialog>
  );
}
