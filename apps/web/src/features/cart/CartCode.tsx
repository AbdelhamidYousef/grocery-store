import { useId, useState, type FormEvent } from 'react';

import type { WebCart } from '../../api/cart';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { useFormat } from '../../i18n/format';
import { TEST_IDS } from '../../lib/test-ids';

import { noticeSentence } from './promo-text';
import { useCartCode } from './queries';

// The code box: an input while no code is on the cart, a removable chip once one is. Notices
// about the code (below minimum, beaten by the bulk tier ...) stay under the chip, because a code
// can be kept while doing nothing for now.
export function CartCode({ cart }: { cart: WebCart }) {
  const { t } = useT();
  const fmt = useFormat();
  const { pricing, currency } = cart;
  const code = useCartCode();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const noticeId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const message = await code.apply(value);
    if (message) setError(message);
    else setValue('');
  };

  const sentences = pricing.notices.flatMap((n) => {
    const text = noticeSentence(n, pricing, (cents) => fmt.money(cents, currency), t);
    return text ? [{ key: `${n.key}:${n.refId ?? ''}`, text }] : [];
  });

  return (
    <div className="flex flex-col gap-2">
      {pricing.code ? (
        <div
          className="flex items-center justify-between gap-3"
          data-testid={TEST_IDS.cartCodeApplied}
        >
          <span className="min-w-0 break-all rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary-strong">
            {pricing.code}
          </span>
          <Button
            variant="ghost"
            size="md"
            disabled={code.removing}
            onClick={() => code.remove()}
            aria-label={t('cart.code.removeAria', { code: pricing.code })}
          >
            {t('cart.code.remove')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          data-testid={TEST_IDS.cartCodeForm}
          className="flex items-start gap-2"
        >
          {/* The wrapper is always mounted so the error, which appears later, is announced. */}
          <div className="min-w-0 flex-1" aria-live="polite">
            <Input
              label={t('cart.code.label')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              {...(error ? { error } : {})}
            />
          </div>
          {/* mt-7 lines the button up with the input, below the label. */}
          <Button type="submit" className="mt-7" loading={code.pending}>
            {t('cart.code.apply')}
          </Button>
        </form>
      )}
      {sentences.length > 0 && (
        <ul id={noticeId} className="flex flex-col gap-1">
          {sentences.map((s) => (
            <li
              key={s.key}
              role="status"
              data-testid={TEST_IDS.cartCodeNotice}
              className="text-sm font-semibold text-primary-strong"
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
