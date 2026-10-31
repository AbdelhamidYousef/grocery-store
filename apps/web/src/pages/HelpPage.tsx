import { HELP_TOPIC_LABELS, HELP_TOPICS, HelpTopicSchema, type HelpTopic } from '@store/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { HelpAccordion } from '../features/help/HelpAccordion';
import { useHelpSearch } from '../features/help/queries';
import { TEST_IDS } from '../lib/test-ids';
import { track } from '../lib/track';

const DEBOUNCE_MS = 300;

const tab =
  'inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 font-display font-semibold hover:bg-pet-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-strong';

// The query and topic live in the URL (`/help?q=refund&topic=returns`): a search can be shared,
// reloaded and walked with Back. The box keeps its own text and writes the URL after a pause, so
// typing does not send a request (or a history entry) per keystroke.
export default function HelpPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const parsedTopic = HelpTopicSchema.safeParse(params.get('topic'));
  const topic: HelpTopic | undefined = parsedTopic.success ? parsedTopic.data : undefined;

  const [text, setText] = useState(q);
  // Back/forward changes the URL; mirror it into the box (without fighting the user's typing).
  // Done during render, the documented way to adjust state when a value changes.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (text.trim() !== q.trim()) setText(q);
  }
  useEffect(() => {
    if (text.trim() === q.trim()) return;
    const id = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (text.trim()) next.set('q', text.trim());
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, q, setParams]);

  const { data, isPending, error, refetch } = useHelpSearch({ q: q.trim() || undefined, topic });

  useEffect(() => {
    if (data && q.trim()) track({ name: 'help_search', query: q.trim(), results: data.length });
    // Once per answered query, not per render.
  }, [data, q]);

  const hrefForTopic = (next: HelpTopic | undefined) => {
    const search = new URLSearchParams();
    if (q) search.set('q', q);
    if (next) search.set('topic', next);
    const s = search.toString();
    return `/help${s ? `?${s}` : ''}`;
  };

  return (
    <Container className="py-8" data-testid={TEST_IDS.pageHelp}>
      <Seo
        title="Help centre"
        description="Answers about shipping, returns, payments and your account."
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Help centre</h1>
      <p className="mt-2 max-w-prose text-muted">Search, or pick a topic.</p>

      <form
        role="search"
        aria-label="Search help"
        className="mt-5 max-w-xl"
        onSubmit={(e) => e.preventDefault()}
      >
        <Input
          label="Search the help centre"
          type="search"
          value={text}
          maxLength={100}
          data-testid={TEST_IDS.helpSearch}
          onChange={(e) => setText(e.target.value)}
        />
      </form>

      <nav aria-label="Help topics" className="mt-4">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              to={hrefForTopic(undefined)}
              aria-current={topic ? undefined : 'page'}
              data-testid={TEST_IDS.helpTopic}
              className={tab}
            >
              All topics
            </Link>
          </li>
          {HELP_TOPICS.map((t) => (
            <li key={t}>
              <Link
                to={hrefForTopic(t)}
                aria-current={topic === t ? 'page' : undefined}
                data-testid={TEST_IDS.helpTopic}
                className={tab}
              >
                {HELP_TOPIC_LABELS[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mt-6" aria-live="polite" aria-label="Help articles">
        {isPending && !error && <Skeleton className="h-48 w-full rounded-card" />}
        {error && !data && (
          <div role="alert">
            <p className="font-semibold text-danger">We could not load the help articles.</p>
            <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data && data.length === 0 && (
          <div data-testid={TEST_IDS.helpNoResults}>
            <p className="font-semibold">
              {q ? `Nothing found for "${q}".` : 'No articles in this topic yet.'}
            </p>
            <p className="mt-1 text-muted">
              Try different words, or{' '}
              <Link to="/help" className="font-semibold text-primary-strong underline">
                browse every topic
              </Link>
              . Still stuck? Get in touch and a real person will answer.
            </p>
          </div>
        )}
        {data && data.length > 0 && (
          <>
            {q && (
              <p className="mb-2 text-sm text-muted">
                {data.length} {data.length === 1 ? 'answer' : 'answers'} for &quot;{q}&quot;
              </p>
            )}
            <HelpAccordion hits={data} searching={!!q.trim()} />
          </>
        )}
      </section>
    </Container>
  );
}
