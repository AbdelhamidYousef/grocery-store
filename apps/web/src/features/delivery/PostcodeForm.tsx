import { useState, type FormEvent } from 'react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { POSTCODE_PATTERN } from '../../lib/postcode';

// One box for the postcode, used by the home hero and by the header dialog. It only checks the
// shape (five digits); the API says whether we deliver there, and `DeliveryResult` shows the answer.
export function PostcodeForm({
  initial = '',
  hint,
  onSubmit,
  className,
  testId = 'postcode-form',
}: {
  initial?: string;
  hint?: string;
  onSubmit: (postcode: string) => void;
  className?: string;
  testId?: string;
}) {
  const { t } = useT();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const postcode = value.trim();
    if (!POSTCODE_PATTERN.test(postcode)) {
      setError(t('delivery.form.invalid'));
      return;
    }
    setError(undefined);
    onSubmit(postcode);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid={testId}
      className={className ?? 'flex max-w-md flex-col gap-3 sm:flex-row sm:items-start'}
    >
      <div className="min-w-0 flex-1">
        <Input
          label={t('delivery.form.label')}
          hint={hint ?? t('delivery.form.hint')}
          error={error}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" className="sm:mt-7">
        {t('delivery.form.button')}
      </Button>
    </form>
  );
}
