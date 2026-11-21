import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

import { useSaveSubstitutionSettings, useSubstitutionSettings } from './queries';

// The account preference: what new cart lines start with. Lives on the profile page.
export function SubstitutionDefault() {
  const { t } = useT();
  const toast = useToast();
  const settings = useSubstitutionSettings();
  const save = useSaveSubstitutionSettings();
  const [choice, setChoice] = useState<'best_match' | 'none' | null>(null);
  const value = choice ?? settings.data?.defaultSubstitution ?? 'best_match';
  const dirty = choice !== null && choice !== settings.data?.defaultSubstitution;

  return (
    <section
      aria-labelledby="subs-default-heading"
      data-testid={TEST_IDS.substitutionDefault}
      className="mt-10 flex max-w-lg flex-col gap-3"
    >
      <h2 id="subs-default-heading" className="font-display text-2xl font-bold">
        {t('subs.account.heading')}
      </h2>
      <p className="text-sm text-muted">{t('subs.account.intro')}</p>
      <select
        aria-labelledby="subs-default-heading"
        value={value}
        disabled={settings.isPending}
        onChange={(event) => setChoice(event.target.value === 'none' ? 'none' : 'best_match')}
        className="min-h-11 w-full max-w-xs rounded-control border border-line bg-surface px-3"
      >
        <option value="best_match">{t('subs.option.best_match')}</option>
        <option value="none">{t('subs.option.none')}</option>
      </select>
      <Button
        type="button"
        className="self-start"
        disabled={!dirty}
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { defaultSubstitution: value },
            {
              onSuccess: () => {
                setChoice(null);
                toast.show(t('subs.account.saved'), 'success');
              },
            },
          )
        }
      >
        {t('subs.account.save')}
      </Button>
    </section>
  );
}
