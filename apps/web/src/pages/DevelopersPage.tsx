import { z } from 'zod';

import { Container } from '../components/layout/Container';
import { Seo } from '../components/Seo';
import { TOOL_EXAMPLES } from '../features/agent/examples';
import { AGENT_TOOLS } from '../features/agent/tools';
import { TEST_IDS } from '../lib/test-ids';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const NOT_EXPOSED = [
  'Checkout and payment: an agent fills the cart, a person reviews and pays.',
  'Placing or cancelling orders, and reading order history.',
  'Account, address, saved card, loyalty and wishlist data.',
  'Anything the signed-in shopper could not already do by clicking.',
];

// The tool list, schemas and examples all come from the registry the browser registers, so this
// page cannot drift from what an agent actually sees.
export default function DevelopersPage() {
  return (
    <Container className="max-w-3xl py-10" data-testid={TEST_IDS.pageDevelopers}>
      <Seo
        title="For developers: agent tools"
        description="Pawsome offers structured WebMCP tools so browser AI agents can search the demo catalogue and fill a cart. Experimental, test data only."
        canonical="/developers"
      />
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Shop with an AI agent</h1>
      <p
        role="note"
        className="mt-3 rounded-control border-2 border-line bg-pet-soft p-3 font-semibold"
      >
        This is a demo store on test data, and WebMCP is an experimental browser feature. Nothing
        here is a stable public API.
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">What is WebMCP?</h2>
      <p className="mt-2 max-w-prose">
        WebMCP is a draft from the W3C Web Machine Learning Community Group. A page registers tools
        with the browser, and an AI agent built into the browser calls them with JSON arguments
        instead of scraping the screen. The tools run in your tab, with your own session and cart,
        through the same API the site itself uses, so an agent can never do more than you can. In a
        browser without WebMCP this page, and the whole store, behave exactly as usual.
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">How to try it</h2>
      <ol className="mt-2 max-w-prose list-decimal space-y-1 pl-6">
        <li>Use Chrome 146 or newer (Canary at the time of writing).</li>
        <li>
          Open <code>chrome://flags/#enable-webmcp-testing</code>, set it to Enabled and relaunch.
        </li>
        <li>
          Open this store and ask the browser&apos;s agent to find a toy and add it to the cart.
        </li>
      </ol>
      <p className="mt-2 max-w-prose text-muted">
        The flag name and the API are still changing; this was last checked in November 2026.
        Browser-agent testing is manual: the automated tests use a stand-in for the browser API.
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">The {AGENT_TOOLS.length} tools</h2>
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
                  {tool.readOnly ? '(reads only)' : '(changes the cart)'}
                </span>
              </p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                  Input schema
                </summary>
                <pre className="overflow-x-auto rounded-control bg-pet-soft p-3 text-sm">
                  {json(z.toJSONSchema(tool.inputSchema, { io: 'input' }))}
                </pre>
              </details>
              {example && (
                <>
                  <p className="mt-3 font-semibold">Example call</p>
                  <pre className="overflow-x-auto rounded-control bg-pet-soft p-3 text-sm">
                    {json(example.input)}
                  </pre>
                  <p className="mt-3 font-semibold">Example result</p>
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
        Errors come back as <code>{'{ "error": { "code", "message" } }'}</code> using the
        store&apos;s own codes, such as <code>OUT_OF_STOCK</code>, <code>CART_CHANGED</code>,{' '}
        <code>TRIAL_LIMIT</code> and <code>RATE_LIMITED</code>. Calls are limited to 30 a minute,
        and every cart change an agent makes shows a notice on screen.
      </p>

      <h2 className="mt-8 font-display text-2xl font-bold">What is deliberately not exposed</h2>
      <ul className="mt-2 max-w-prose list-disc space-y-1 pl-6">
        {NOT_EXPOSED.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Container>
  );
}
