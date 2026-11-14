import type { GuideCard as GuideCardData } from '@store/shared';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { useT } from '../../i18n';
import { TEST_IDS } from '../../lib/test-ids';

// One link per card (a single tap target, one tab stop), like the product card.
export function GuideCard({ guide }: { guide: GuideCardData }) {
  const { t } = useT();
  return (
    <li className="min-w-0">
      <Link
        to={`/guides/${guide.slug}`}
        data-testid={TEST_IDS.guideCard}
        className="flex h-full flex-col gap-2 overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card transition-transform hover:-translate-y-0.5"
      >
        {guide.coverUrl && (
          <img
            src={guide.coverUrl}
            alt=""
            loading="lazy"
            className="aspect-[16/9] w-full rounded-control object-cover"
          />
        )}
        <span className="flex flex-wrap items-center gap-2">
          <Badge>{guide.category.name}</Badge>
          <span className="text-sm text-muted">
            {t('content.guides.minRead', { minutes: guide.readingMinutes })}
          </span>
        </span>
        <span className="font-display text-xl font-bold leading-snug break-words">
          {guide.title}
        </span>
        <span className="text-muted">{guide.summary}</span>
      </Link>
    </li>
  );
}
