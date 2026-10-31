import {
  CONTACT_TOPIC_LABELS,
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
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

type Field = 'name' | 'email' | 'topic' | 'message';

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return 'You have sent several messages already. Please wait a while and try again.';
  }
  return 'We could not send your message right now. Please try again in a moment.';
}

export default function ContactPage() {
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
          next[key] ??= key === 'topic' ? 'Choose what your message is about' : issue.message;
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
        <Seo title="Message sent" noindex />
        <section
          aria-labelledby="contact-done"
          className="max-w-xl rounded-card border-2 border-success bg-success-soft p-5"
          data-testid={TEST_IDS.contactSuccess}
        >
          <h1 id="contact-done" className="font-display text-2xl font-bold">
            Thank you, we got your message
          </h1>
          <p className="mt-2">
            Your reference is <strong>{receipt.reference}</strong>. We have emailed you a copy and
            will reply to that address, usually within two working days.
          </p>
          <p className="mt-4">
            <Link to="/help" className="font-semibold text-primary-strong underline">
              Browse the help centre
            </Link>
          </p>
        </section>
      </Container>
    );
  }

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageContact}>
      <Seo title="Contact us" description="Write to the Pawsome team." />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Contact us</h1>
      <p className="mt-2 max-w-prose text-muted">
        Questions about an order, a product or your data? Write to us and a person will answer. You
        may find a quick answer in the{' '}
        <Link to="/help" className="font-semibold text-primary-strong underline">
          help centre
        </Link>
        .
      </p>
      <form
        onSubmit={submit}
        noValidate
        data-testid={TEST_IDS.contactForm}
        className="relative mt-5 flex max-w-xl flex-col gap-4"
      >
        <FormAlert message={send.error ? messageFor(send.error) : null} />
        <Input
          ref={nameRef}
          label="Your name"
          autoComplete="name"
          value={values.name}
          onChange={set('name')}
          error={errors.name}
        />
        <Input
          ref={emailRef}
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          hint="We reply to this address."
          value={values.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Select
          ref={topicRef}
          label="What is it about?"
          value={values.topic}
          onChange={set('topic')}
          error={errors.topic}
        >
          <option value="">Choose a topic</option>
          {CONTACT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {CONTACT_TOPIC_LABELS[t]}
            </option>
          ))}
        </Select>
        <Input
          label="Order number (optional)"
          placeholder="PW-2026-000123"
          autoComplete="off"
          value={values.orderNumber}
          onChange={set('orderNumber')}
        />
        <Textarea
          ref={messageRef}
          label="Your message"
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
            Leave this empty
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
          Send message
        </Button>
      </form>
    </Container>
  );
}
