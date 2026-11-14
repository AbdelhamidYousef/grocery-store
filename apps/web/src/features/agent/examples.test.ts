import { describe, expect, it } from 'vitest';

import { TOOL_EXAMPLES } from './examples';
import { AGENT_TOOLS } from './tools';

describe('tool examples', () => {
  it('has one example per tool and none for a tool that does not exist', () => {
    expect(Object.keys(TOOL_EXAMPLES).sort()).toEqual(AGENT_TOOLS.map((t) => t.name).sort());
  });

  it.each(AGENT_TOOLS.map((t) => [t.name, t] as const))(
    'the documented input for %s passes its schema',
    (name, tool) => {
      expect(tool.inputSchema.safeParse(TOOL_EXAMPLES[name]?.input).success).toBe(true);
    },
  );
});
