import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { TEST_IDS } from '../../lib/test-ids';

// "What people mention": each chip filters the list to reviews containing that phrase; pressing
// the active one clears it.
export function TopicChips({
  topics,
  active,
  onPick,
}: {
  topics: readonly { topic: string; count: number }[];
  active: string | undefined;
  onPick: (topic: string | undefined) => void;
}) {
  const { t } = useT();
  if (topics.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{t('reviews.topics.heading')}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {topics.map((t) => {
          const pressed = active === t.topic;
          return (
            <li key={t.topic}>
              <button
                type="button"
                data-testid={TEST_IDS.reviewTopic}
                aria-pressed={pressed}
                onClick={() => onPick(pressed ? undefined : t.topic)}
                className={cn(
                  'min-h-9 rounded-full border-2 px-3 text-sm font-semibold',
                  pressed
                    ? 'border-ink bg-ink text-surface'
                    : 'border-line bg-surface hover:border-ink',
                )}
              >
                {t.topic} <span className="font-normal opacity-80">({t.count})</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
