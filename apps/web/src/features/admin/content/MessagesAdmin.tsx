import { CONTACT_TOPIC_LABELS } from '@store/shared';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { TEST_IDS } from '../../../lib/test-ids';
import { formatWhen } from '../order-status';

import { useAdminMessages, useSetContactHandled } from './queries';

export function MessagesAdmin() {
  const { data, isPending, error, refetch } = useAdminMessages();
  const set = useSetContactHandled();
  return (
    <section aria-labelledby="messages-heading" data-testid="admin-messages">
      <Seo title="Admin messages" noindex />
      <h2 id="messages-heading" className="font-display text-xl font-bold">
        Contact messages
      </h2>
      <p className="mt-1 text-muted">Open messages first, newest first. Times are UTC.</p>
      {isPending && !error && <Skeleton className="mt-4 h-40 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the messages.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-4 text-muted" data-testid={TEST_IDS.adminEmpty}>
          No messages yet.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line">
          {data.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-start justify-between gap-3 p-3"
              data-testid={TEST_IDS.adminRow}
            >
              <div className="min-w-0 max-w-prose">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span>{m.reference}</span>
                  <Badge tone={m.handledAt ? 'success' : 'danger'}>
                    {m.handledAt ? 'handled' : 'open'}
                  </Badge>
                  <Badge>{CONTACT_TOPIC_LABELS[m.topic]}</Badge>
                </p>
                <p className="mt-1 break-words">
                  {m.name} &middot;{' '}
                  <a href={`mailto:${m.email}`} className="text-primary-strong underline">
                    {m.email}
                  </a>
                  {m.orderNumber && <> &middot; order {m.orderNumber}</>}
                </p>
                <p className="text-sm text-muted">Received {formatWhen(m.createdAt)}</p>
                <p className="mt-2 whitespace-pre-wrap break-words">{m.message}</p>
              </div>
              <Button
                variant="secondary"
                loading={set.isPending && set.variables?.id === m.id}
                aria-label={`${m.handledAt ? 'Reopen' : 'Mark handled'} ${m.reference}`}
                onClick={() => set.mutate({ id: m.id, handled: !m.handledAt })}
              >
                {m.handledAt ? 'Reopen' : 'Mark handled'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {set.isError && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          We could not update that message. Try again.
        </p>
      )}
    </section>
  );
}
