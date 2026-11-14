import { z } from 'zod';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { TOOL_EXAMPLES } from '../features/agent/examples';
import { AGENT_TOOLS } from '../features/agent/tools';
import { useT, type StringKey } from '../i18n';
import { TEST_IDS } from '../lib/test-ids';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const NOT_EXPOSED: StringKey[] = [
  'content.dev.notExposed.checkout',
  'content.dev.notExposed.orders',
  'content.dev.notExposed.account',
  'content.dev.notExposed.clicking',
];

// The tool list, schemas and examples all come from the registry the browser registers, so this
// page cannot drift from what an agent actually sees.
export default function DevelopersPage() {
  const { t } = useT();
  return (
    <Container className="max-w-3xl py-10" data-testid={TEST_IDS.pageDevelopers}>
      <Seo
        title={t('content.dev.seoTitle')}
        description={t('content.dev.seoDescription')}
        canonical="/developers"
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">{t('content.dev.title')}</h1>
      <p
        role="note"
        className="mt-3 rounded-control border-2 border-line bg-pet-soft p-3 font-semibold"
      >
        {t('content.dev.note')}
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">{t('content.dev.whatTitle')}</h2>
      <p className="mt-2 max-w-prose">{t('content.dev.whatText')}</p>

      <h2 className="mt-8 font-display text-2xl font-bold">{t('content.dev.tryTitle')}</h2>
      <ol className="mt-2 max-w-prose list-decimal space-y-1 pl-6">
        <li>{t('content.dev.try1')}</li>
        <li>
          {t('content.dev.try2Before')} <code>chrome://flags/#enable-webmcp-testing</code>
          {t('content.dev.try2After')}
        </li>
        <li>{t('content.dev.try3')}</li>
      </ol>
      <p className="mt-2 max-w-prose text-muted">{t('content.dev.tryNote')}</p>

      <h2 className="mt-8 font-display text-2xl font-bold">
        {t('content.dev.toolsTitle', { count: AGENT_TOOLS.length })}
      </h2>
      <ul className="mt-4 space-y-6">
        {AGENT_TOOLS.map((tool) => {
          const example = TOOL_EXAMPLES[tool.name];
          return (
            <li
              key={tool.name}
              data-testid={TEST_IDS.agentTool}
              className="rounded-card border-2 border-line p-4"
            >
              <h3 className="font-mono text-lg font-bold" data-testid={TEST_IDS.agentToolName}>
                {tool.name}
              </h3>
              <p className="mt-1">
                {tool.description}{' '}
                <span className="text-muted">
                  {tool.readOnly ? t('content.dev.readsOnly') : t('content.dev.changesCart')}
                </span>
              </p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                  {t('content.dev.schema')}
                </summary>
                <pre className="overflow-x-auto rounded-control bg-pet-soft p-3 text-sm">
                  {json(z.toJSONSchema(tool.inputSchema, { io: 'input' }))}
                </pre>
              </details>
              {example && (
                <>
                  <p className="mt-3 font-semibold">{t('content.dev.exampleCall')}</p>
                  <pre className="overflow-x-auto rounded-control bg-pet-soft p-3 text-sm">
                    {json(example.input)}
                  </pre>
                  <p className="mt-3 font-semibold">{t('content.dev.exampleResult')}</p>
                  <pre className="overflow-x-auto rounded-control bg-pet-soft p-3 text-sm">
                    {json(example.output)}
                  </pre>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 max-w-prose">
        {t('content.dev.errorsLead')} <code>{'{ "error": { "code", "message" } }'}</code>{' '}
        {t('content.dev.errorsMid')} <code>OUT_OF_STOCK</code>, <code>CART_CHANGED</code>,{' '}
        <code>TRIAL_LIMIT</code> {t('content.dev.errorsAnd')} <code>RATE_LIMITED</code>
        {t('content.dev.errorsRest')}
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">{t('content.dev.notExposedTitle')}</h2>
      <ul className="mt-2 max-w-prose list-disc space-y-1 pl-6">
        {NOT_EXPOSED.map((line) => (
          <li key={line}>{t(line)}</li>
        ))}
      </ul>
    </Container>
  );
}
