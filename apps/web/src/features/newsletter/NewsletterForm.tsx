import { NEWSLETTER_CONSENT_TEXT, NewsletterSubscribeSchema } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiError } from '../../api/client';
import { subscribeNewsletter } from '../../api/newsletter';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { PETS } from '../../lib/pets';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';

// The attribute value a pet carries (`small`, not the `small-pets` slug).
const PET_VALUE: Record<string, string> = { 'small-pets': 'small' };
const petValue = (slug: string): string => PET_VALUE[slug] ?? slug.replace(/s$/, '');

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [pets, setPets] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [consentError, setConsentError] = useState<string | undefined>();

  const send = useMutation({
    mutationFn: subscribeNewsletter,
    onSuccess: () => track({ name: 'newsletter_subscribe', pets: pets.length }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = NewsletterSubscribeSchema.safeParse({ email, pets, consent, website });
    if (!parsed.success) {
      setError(parsed.error.issues.find((i) => i.path[0] === 'email')?.message);
      setConsentError(
        parsed.error.issues.some((i) => i.path[0] === 'consent')
          ? 'Please tick the box to subscribe'
          : undefined,
      );
      return;
    }
    setError(undefined);
    setConsentError(undefined);
    send.mutate(parsed.data);
  };

  if (send.isSuccess) {
    return (
      <p
        role="status"
        data-testid={TEST_IDS.newsletterDone}
        className="rounded-control border-2 border-success bg-success-soft p-4 font-semibold"
      >
        Almost there! If this address can receive our emails, a confirmation link is on its way.
        Click it and your welcome code follows.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid={TEST_IDS.newsletterForm}
      className="relative flex max-w-xl flex-col gap-3"
    >
      {send.error && (
        <p role="alert" className="font-semibold text-danger">
          {send.error instanceof ApiError && send.error.status === 429
            ? 'Too many sign-ups from here. Please try again later.'
            : 'We could not sign you up right now. Please try again in a moment.'}
        </p>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <fieldset className="flex flex-col">
        <legend className="font-semibold">Which pets do you have?</legend>
        <div className="flex flex-wrap gap-x-5">
          {PETS.map((p) => {
            const value = petValue(p.slug);
            return (
              <Checkbox
                key={p.slug}
                label={p.name}
                checked={pets.includes(value)}
                onChange={(e) =>
                  setPets((cur) =>
                    e.target.checked ? [...cur, value] : cur.filter((v) => v !== value),
                  )
                }
              />
            );
          })}
        </div>
      </fieldset>
      <Checkbox
        label={NEWSLETTER_CONSENT_TEXT}
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        error={consentError}
      />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      <Button type="submit" loading={send.isPending}>
        Subscribe and get 10% off
      </Button>
    </form>
  );
}
