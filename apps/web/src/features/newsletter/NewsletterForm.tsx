import { DEPARTMENTS, NewsletterSubscribeSchema } from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiError } from '../../api/client';
import { subscribeNewsletter } from '../../api/newsletter';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';
import { track } from '../../lib/track';
import { departmentName } from '../navigation/department-names';

export function NewsletterForm() {
  const { t, tm } = useT();
  const [email, setEmail] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [consentError, setConsentError] = useState<string | undefined>();

  const send = useMutation({
    mutationFn: subscribeNewsletter,
    onSuccess: () => track({ name: 'newsletter_subscribe', interests: interests.length }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = NewsletterSubscribeSchema.safeParse({ email, interests, consent, website });
    if (!parsed.success) {
      const emailIssue = parsed.error.issues.find((i) => i.path[0] === 'email');
      setError(emailIssue ? tm(emailIssue.message) : undefined);
      setConsentError(
        parsed.error.issues.some((i) => i.path[0] === 'consent')
          ? t('loyalty.newsletter.consentRequired')
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
        {t('loyalty.newsletter.done')}
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
            ? t('loyalty.newsletter.tooMany')
            : t('loyalty.newsletter.failed')}
        </p>
      )}
      <Input
        label={t('loyalty.newsletter.email')}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <fieldset className="flex flex-col">
        <legend className="font-semibold">{t('loyalty.newsletter.interests')}</legend>
        <div className="flex flex-wrap gap-x-5">
          {DEPARTMENTS.map((d) => (
            <Checkbox
              key={d.slug}
              label={departmentName(t, d)}
              checked={interests.includes(d.slug)}
              onChange={(e) =>
                setInterests((cur) =>
                  e.target.checked ? [...cur, d.slug] : cur.filter((v) => v !== d.slug),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      <Checkbox
        label={t('loyalty.newsletter.consent')}
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        error={consentError}
      />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          {t('loyalty.newsletter.honeypot')}
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
        {t('loyalty.newsletter.submit')}
      </Button>
    </form>
  );
}
