import { Button } from '../../components/ui/Button';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

import { useSubstitutionActions } from './queries';

// One choice for every line of the cart ("Apply to all"). A particular product belongs to one
// line, so only the two general choices are offered.
export function ApplyToAll() {
  const { t } = useT();
  const actions = useSubstitutionActions();
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm"
      data-testid={TEST_IDS.substitutionAll}
    >
      <span className="font-semibold">{t('subs.all.label')}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={actions.pending}
        onClick={() => actions.setAll('best_match')}
      >
        {t('subs.option.best_match')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={actions.pending}
        onClick={() => actions.setAll('none')}
      >
        {t('subs.option.none')}
      </Button>
    </div>
  );
}
