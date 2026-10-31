import {
  HELP_TOPIC_LABELS,
  HELP_TOPICS,
  HelpTopicSchema,
  type AdminHelpArticle,
  type HelpTopic,
} from '@store/shared';
import { useState, type FormEvent } from 'react';

import { Seo } from '../../../components/Seo';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/Toast';
import { FormAlert } from '../../auth/AuthCard';
import { adminErrorMessage } from '../errors';

import { MarkdownEditor } from './MarkdownEditor';
import { useAdminHelp, useDeleteHelp, useSaveHelp } from './queries';

// List and editor on one screen: an article is a question and a short answer, so a separate page
// per article would be more clicking than content. `editing` is an article, 'new', or nothing.
export function HelpAdmin() {
  const { data, isPending, error, refetch } = useAdminHelp();
  const [editing, setEditing] = useState<AdminHelpArticle | 'new' | null>(null);
  const remove = useDeleteHelp();
  const toast = useToast();

  return (
    <section aria-labelledby="help-heading" data-testid="admin-help">
      <Seo title="Admin help articles" noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="help-heading" className="font-display text-xl font-bold">
          Help articles
        </h2>
        <Button onClick={() => setEditing('new')}>New article</Button>
      </div>

      {editing && (
        <HelpForm
          key={editing === 'new' ? 'new' : editing.id}
          article={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {isPending && !error && <Skeleton className="mt-4 h-48 w-full rounded-card" />}
      {error && !data && (
        <div className="mt-4" role="alert">
          <p className="font-semibold text-danger">We could not load the help articles.</p>
          <Button className="mt-2" variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data && (
        <ul
          className="mt-4 divide-y divide-line rounded-card border border-line"
          data-testid="admin-help-list"
        >
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{a.question}</p>
                <p className="mt-1 flex flex-wrap gap-2 text-sm text-muted">
                  <Badge tone="primary">{HELP_TOPIC_LABELS[a.topic]}</Badge>
                  {a.status === 'draft' && <Badge>draft</Badge>}
                  <span>/{a.slug}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete ${a.question}`}
                  onClick={() => {
                    if (!window.confirm('Delete this help article?')) return;
                    remove.mutate(a.id, {
                      onSuccess: () => toast.show('Article deleted', 'success'),
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {data.length === 0 && <li className="p-3 text-muted">No help articles yet.</li>}
        </ul>
      )}
    </section>
  );
}

function HelpForm({ article, onDone }: { article: AdminHelpArticle | null; onDone: () => void }) {
  const save = useSaveHelp(article?.id ?? null);
  const toast = useToast();
  const [topic, setTopic] = useState<HelpTopic>(article?.topic ?? HELP_TOPICS[0]);
  const [question, setQuestion] = useState(article?.question ?? '');
  const [answerMd, setAnswerMd] = useState(article?.answerMd ?? '');
  const [slug, setSlug] = useState(article?.slug ?? '');
  const [sortOrder, setSortOrder] = useState(String(article?.sortOrder ?? 0));
  const [status, setStatus] = useState<'draft' | 'published'>(article?.status ?? 'published');
  const [message, setMessage] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate(
      { topic, question, answerMd, slug, sortOrder: Number(sortOrder) || 0, status },
      {
        onSuccess: () => {
          toast.show(article ? 'Article saved' : 'Article created', 'success');
          onDone();
        },
        onError: (err) => setMessage(adminErrorMessage(err)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label={article ? 'Edit help article' : 'New help article'}
      className="mt-4 flex flex-col gap-4 rounded-card border-2 border-line bg-surface p-4"
      data-testid="admin-help-form"
    >
      <FormAlert message={message} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Topic"
          value={topic}
          onChange={(e) => {
            const parsed = HelpTopicSchema.safeParse(e.target.value);
            if (parsed.success) setTopic(parsed.data);
          }}
        >
          {HELP_TOPICS.map((t) => (
            <option key={t} value={t}>
              {HELP_TOPIC_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value === 'draft' ? 'draft' : 'published')}
        >
          <option value="published">Published</option>
          <option value="draft">Draft (hidden)</option>
        </Select>
        <Input
          label="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
        <Input
          label="Slug"
          hint="Leave empty to make one from the question."
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <Input
          label="Order inside the topic"
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <MarkdownEditor label="Answer" value={answerMd} onChange={setAnswerMd} rows={8} />
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {article ? 'Save article' : 'Create article'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
