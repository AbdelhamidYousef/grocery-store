import {
  GIFT_KEYS,
  GIFT_QUESTIONS,
  GiftAnswersSchema,
  giftSearch,
  parseGiftAnswers,
  type GiftAnswers,
} from '@store/shared';
import { formatMoney } from '@store/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { Container } from '../../components/layout/Container';
import { Seo } from '../../components/Seo';
import { Button } from '../../components/ui/Button';

// The quiz is a form with one question per step, and ALL its state is the URL: answers are
// `?pet=dog&age=adult...` and `step` says which question is on screen. A reload, the Back button
// and a shared link all land on the same question, and an invalid or half-filled URL simply
// starts at the first question that has no valid answer.
export function GiftWizard() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { complete, partial } = parseGiftAnswers(search);
  const answered = GIFT_KEYS.filter((k) => partial[k] !== undefined).length;

  const stepParam = Number(search.get('step'));
  const wantsStep = Number.isInteger(stepParam) && stepParam >= 1 && stepParam <= GIFT_KEYS.length;
  // Everything answered and nobody asked to revisit a question: show the picks.
  const index = wantsStep ? Math.min(stepParam - 1, answered) : answered;

  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the new question's heading so a screen reader announces it.
  useEffect(() => {
    if (index < GIFT_KEYS.length) heading.current?.focus({ preventScroll: true });
  }, [index]);

  const question = GIFT_QUESTIONS[index];
  const [picked, setPicked] = useState<{ key: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (complete && !wantsStep) {
    return <Navigate to={`/gift-finder/result?${giftSearch(complete)}`} replace />;
  }
  if (!question) return <Navigate to="/gift-finder" replace />;

  const saved = partial[question.key] ?? (complete ? complete[question.key] : undefined);
  const current =
    picked?.key === question.key ? picked.value : saved !== undefined ? String(saved) : '';

  const next = (event: FormEvent) => {
    event.preventDefault();
    if (current === '') {
      setError('Pick one to continue.');
      return;
    }
    const merged: Partial<GiftAnswers> = { ...(complete ?? partial) };
    const parsed = GiftAnswersSchema.shape[question.key].safeParse(current);
    if (!parsed.success) return setError('Pick one to continue.');
    (merged as Record<string, unknown>)[question.key] = parsed.data;
    setError(null);
    setPicked(null);
    const full = GiftAnswersSchema.safeParse(merged);
    if (full.success && index === GIFT_KEYS.length - 1) {
      void navigate(`/gift-finder/result?${giftSearch(full.data)}`);
    } else {
      const params = new URLSearchParams(giftSearch(merged));
      params.set('step', String(index + 2));
      void navigate(`/gift-finder?${params.toString()}`);
    }
  };

  const back = new URLSearchParams(giftSearch(complete ?? partial));
  back.set('step', String(index));

  return (
    <Container className="py-8" data-testid="page-gift-finder">
      <Seo
        title="Gift finder"
        description="Answer four quick questions and we will suggest gifts for the pet in your life."
        canonical="/gift-finder"
      />
      <div className="mx-auto max-w-xl">
        <p className="font-display text-sm font-bold text-muted" data-testid="gift-progress">
          Question {index + 1} of {GIFT_KEYS.length}
        </p>
        <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${((index + 1) / GIFT_KEYS.length) * 100}%` }}
          />
        </div>
        <form onSubmit={next} noValidate className="mt-6" data-testid="gift-form">
          <fieldset aria-describedby={error ? 'gift-error' : undefined}>
            <legend className="mb-1">
              <h1
                ref={heading}
                tabIndex={-1}
                className="font-display text-3xl font-bold focus:outline-none"
                data-testid="gift-question"
              >
                {question.title}
              </h1>
            </legend>
            {question.hint && <p className="mb-2 text-muted">{question.hint}</p>}
            <div className="mt-3 flex flex-col gap-2">
              {question.options.map((option) => {
                const id = `gift-${question.key}-${option.value}`;
                return (
                  <label
                    key={option.value}
                    htmlFor={id}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border-2 border-line px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                  >
                    <input
                      id={id}
                      type="radio"
                      name={question.key}
                      value={option.value}
                      checked={current === option.value}
                      onChange={() => {
                        setPicked({ key: question.key, value: option.value });
                        setError(null);
                      }}
                      className="h-5 w-5 shrink-0 accent-primary"
                    />
                    <span>
                      {question.key === 'budget' && option.value !== '0'
                        ? `Up to ${formatMoney(Number(option.value), 'EUR')}`
                        : option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {error && (
            <p
              id="gift-error"
              role="alert"
              data-testid="gift-error"
              className="mt-2 font-semibold text-danger"
            >
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {index > 0 ? (
              <Link
                to={`/gift-finder?${back.toString()}`}
                className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-primary-strong underline"
              >
                Back
              </Link>
            ) : (
              <span />
            )}
            <Button type="submit" data-testid="gift-next">
              {index === GIFT_KEYS.length - 1 ? 'Show my gift ideas' : 'Next'}
            </Button>
          </div>
        </form>
      </div>
    </Container>
  );
}
