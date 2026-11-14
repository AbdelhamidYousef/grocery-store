import { z } from 'zod';

import { track } from '../../lib/track';

import { AGENT_TOOLS, toAgentError, type AgentError, type AgentTool } from './tools';

// The only file that knows the WebMCP API. The spec is a moving draft, so when it changes, this
// is the one place to edit (see the decisions log, 24.1). Progressive enhancement: with no
// `modelContext` in the browser this does nothing, and there is deliberately no polyfill (it would
// claim a capability the browser does not have, for no real user).

export interface AgentHooks {
  /** Return an error to refuse the call before it runs (the rate limit). */
  guard?: (tool: AgentTool) => AgentError | null;
  /** Runs after every call, also failed ones; for visible feedback and cache sync. */
  onCall?: (tool: AgentTool, input: unknown, result: unknown) => void;
}

function findModelContext(): ModelContextApi | null {
  if (typeof document !== 'undefined' && document.modelContext) return document.modelContext;
  if (typeof navigator !== 'undefined' && navigator.modelContext) return navigator.modelContext;
  return null;
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // `input`: describes what an agent sends (defaults make fields optional), not what we parse to.
  const json: Record<string, unknown> = z.toJSONSchema(schema, { io: 'input' });
  delete json.$schema; // the draft URL is noise for an agent
  return json;
}

/** Registers the tools when the browser supports WebMCP; returns the function that removes them. */
export function registerAgentTools(
  hooks: AgentHooks = {},
  tools: readonly AgentTool[] = AGENT_TOOLS,
): () => void {
  const context = findModelContext();
  if (!context?.registerTool) return () => undefined;

  const controller = new AbortController();
  const registered: string[] = [];

  for (const tool of tools) {
    const descriptor: ModelContextTool = {
      name: tool.name,
      description: tool.description,
      inputSchema: toJsonSchema(tool.inputSchema),
      annotations: { readOnlyHint: tool.readOnly },
      execute: async (input) => {
        // Name only: arguments can hold anything the agent was told, so they are never tracked.
        track({ name: 'agent_tool_call', tool: tool.name });
        let result: unknown;
        try {
          result = hooks.guard?.(tool) ?? (await tool.execute(input));
        } catch (cause) {
          result = toAgentError(cause);
        }
        try {
          hooks.onCall?.(tool, input, result);
        } catch {
          // Feedback is best-effort: a broken toast must not turn a finished call into a failure.
        }
        return result;
      },
    };
    try {
      // Current draft: abort the signal to unregister. Older previews ignore the option.
      const done = context.registerTool(descriptor, { signal: controller.signal });
      if (done instanceof Promise) done.catch(() => undefined);
      registered.push(tool.name);
    } catch {
      // A duplicate name or a rejected tool must not stop the others being offered.
    }
  }

  let removed = false;
  const unregister = () => {
    if (removed) return;
    removed = true;
    window.removeEventListener('pagehide', unregister);
    controller.abort();
    for (const name of registered) {
      try {
        void context.unregisterTool?.(name);
      } catch {
        // Already gone.
      }
    }
  };
  window.addEventListener('pagehide', unregister);
  return unregister;
}
