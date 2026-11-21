import {
  CONTACT_TOPICS,
  ContactBodySchema,
  type ContactReceipt,
  type ContactTopic,
} from '@store/shared';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '../api/client';
import { sendContactMessage } from '../api/contact';
import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { FormAlert } from '../features/auth/AuthCard';
import { useT, type StringKey, type TFunction } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

type Field = 'name' | 'email' | 'topic' | 'message';

const TOPIC_KEYS: Record<ContactTopic, StringKey> = {
  order: 'content.contact.topic.order',
  shipping: 'content.contact.topic.shipping',
  returns: 'content.contact.topic.returns',
  product: 'content.contact.topic.product',
  account: 'content.contact.topic.account',
  privacy: 'content.contact.topic.privacy',
  other: 'content.contact.topic.other',
};

function messageFor(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 429) {
    return t('content.contact.tooMany');
  }
  return t('content.contact.failed');
}

export default function ContactPage() {
  const { t, tm } = useT();
  const [values, setValues] = useState({
    name: '',
    email: '',
    topic: '' as ContactTopic | '',
    orderNumber: '',
    message: '',
    website: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [receipt, setReceipt] = useState<ContactReceipt | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const topicRef = useRef<HTMLSelectElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const send = useMutation({
    mutationFn: sendContactMessage,
    onSuccess: (r, sent) => {
      setReceipt(r);
      track({ name: 'contact_sent', topic: sent.topic });
    },
  });

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = ContactBodySchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'topic' || key === 'message') {
          next[key] ??= key === 'topic' ? t('content.contact.topicRequired') : tm(issue.message);
        }
      }
      setErrors(next);
      // Move focus to the first field with a problem, so a keyboard or screen-reader user lands on it.
      const first = (['name', 'email', 'topic', 'message'] as const).find((k) => next[k]);
      const target = { name: nameRef, email: emailRef, topic: topicRef, message: messageRef }[
        first ?? 'name'
      ];
      if (first) target.current?.focus();
      return;
    }
    setErrors({});
    send.mutate(parsed.data);
  };

  if (receipt) {
    return (
      <Container className="py-8" data-testid={TEST_IDS.pageContact}>
        <Seo title={t('content.contact.sentTitle')} noindex />
        <section
          aria-labelledby="contact-done"
          className="max-w-xl rounded-card border-2 border-success bg-success-soft p-5"
          data-testid={TEST_IDS.contactSuccess}
        >
          <h1 id="contact-done" className="font-display text-2xl font-bold">
            {t('content.contact.thanks')}
          </h1>
          <p className="mt-2">
            {t('content.contact.referenceBefore')} <strong>{receipt.reference}</strong>
            {t('content.contact.referenceAfter')}
          </p>
          <p className="mt-4">
            <Link to="/help" className="font-semibold text-primary-strong underline">
              {t('content.contact.browseHelp')}
            </Link>
          </p>
        </section>
      </Container>
    );
  }

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageContact}>
      <Seo title={t('content.contact.title')} description={t('content.contact.seoDescription')} />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('content.contact.title')}</h1>
      <p className="mt-2 max-w-prose text-muted">
        {t('content.contact.intro')}{' '}
        <Link to="/help" className="font-semibold text-primary-strong underline">
          {t('content.contact.helpLink')}
        </Link>
        .
      </p>
      <form
        onSubmit={submit}
        noValidate
        data-testid={TEST_IDS.contactForm}
        className="relative mt-5 flex max-w-xl flex-col gap-4"
      >
        <FormAlert message={send.error ? messageFor(send.error, t) : null} />
        <Input
          ref={nameRef}
          label={t('content.contact.name')}
          autoComplete="name"
          value={values.name}
          onChange={set('name')}
          error={errors.name}
        />
        <Input
          ref={emailRef}
          label={t('content.contact.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          hint={t('content.contact.emailHint')}
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Select
          ref={topicRef}
          label={t('content.contact.topic')}
          value={values.topic}
          onChange={set('topic')}
          error={errors.topic}
        >
          <option value="">{t('content.contact.topicChoose')}</option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {t(TOPIC_KEYS[topic])}
            </option>
          ))}
        </Select>
        <Input
          label={t('content.contact.order')}
          placeholder="GR-2026-000123"
          autoComplete="off"
          value={values.orderNumber}
          onChange={set('orderNumber')}
        />
        <Textarea
          ref={messageRef}
          label={t('content.contact.message')}
          rows={6}
          maxLength={2000}
          value={values.message}
          onChange={set('message')}
          error={errors.message}
        />
        {/* Honeypot: out of sight and out of the tab order for people; a script that fills every
            input fills this one too, and the API then drops the message silently. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            {t('content.contact.honeypot')}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={values.website}
              onChange={set('website')}
              data-testid={TEST_IDS.contactHoneypot}
            />
          </label>
        </div>
        <Button type="submit" loading={send.isPending}>
          {t('content.contact.send')}
        </Button>
      </form>
    </Container>
  );
}
