import { afterEach, describe, expect, it, vi } from 'vitest';

import { AGENT_TOOLS, type AgentTool } from './tools';
import { registerAgentTools } from './webmcp';

const noop = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track', () => ({ track: noop }));

type Registered = { tool: ModelContextTool; signal: AbortSignal | undefined };

function fakeContext() {
  const registered: Registered[] = [];
  const api: ModelContextApi = {
    registerTool: (tool, options) => {
      registered.push({ tool, signal: options?.signal });
    },
  };
  return { api, registered };
}

const echo: AgentTool = {
  name: 'echo',
  description: 'Echo the input back for tests',
  inputSchema: AGENT_TOOLS[0]!.inputSchema,
  readOnly: true,
  execute: (input) => Promise.resolve({ echoed: input }),
  describe: () => null,
};

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  Reflect.deleteProperty(navigator, 'modelContext');
  vi.clearAllMocks();
});

describe('registerAgentTools', () => {
  it('registers every tool with a JSON Schema on document.modelContext', () => {
    const { api, registered } = fakeContext();
    Object.defineProperty(document, 'modelContext', { value: api, configurable: true });
    registerAgentTools();
    expect(registered.map((r) => r.tool.name)).toEqual(AGENT_TOOLS.map((t) => t.name));
    const search = registered.find((r) => r.tool.name === 'search_catalog')!.tool;
    expect(search.inputSchema).toMatchObject({
      type: 'object',
      properties: { limit: { maximum: 24 } },
    });
    expect(search.inputSchema).not.toHaveProperty('$schema');
    expect(search.annotations).toEqual({ readOnlyHint: true });
    expect(registered.find((r) => r.tool.name === 'add_to_cart')!.tool.annotations).toEqual({
      readOnlyHint: false,
    });
  });

  it('falls back to the older navigator.modelContext', () => {
    const { api, registered } = fakeContext();
    Object.defineProperty(navigator, 'modelContext', { value: api, configurable: true });
    registerAgentTools();
    expect(registered).toHaveLength(AGENT_TOOLS.length);
  });

  it('does nothing and does not throw without a modelContext', () => {
    expect(() => registerAgentTools()()).not.toThrow();
  });

  it('runs the tool, tracks the name only and returns the result', async () => {
    const { api, registered } = fakeContext();
    Object.defineProperty(document, 'modelContext', { value: api, configurable: true });
    registerAgentTools({}, [echo]);
    const result = await registered[0]!.tool.execute({ secret: 'x' });
    expect(result).toEqual({ echoed: { secret: 'x' } });
    expect(noop).toHaveBeenCalledWith({ name: 'agent_tool_call', tool: 'echo' });
  });

  it('turns a throwing tool into a coded error', async () => {
    const { api, registered } = fakeContext();
    Object.defineProperty(document, 'modelContext', { value: api, configurable: true });
    registerAgentTools({}, [{ ...echo, execute: () => Promise.reject(new Error('stack here')) }]);
    expect(await registered[0]!.tool.execute({})).toEqual({
      error: { code: 'INTERNAL', message: expect.not.stringContaining('stack') as string },
    });
  });

  it('aborts the signal on pagehide and on the returned function, once', () => {
    const { api, registered } = fakeContext();
    Object.defineProperty(document, 'modelContext', { value: api, configurable: true });
    const unregister = registerAgentTools();
    expect(registered[0]!.signal!.aborted).toBe(false);
    window.dispatchEvent(new Event('pagehide'));
    expect(registered.every((r) => r.signal!.aborted)).toBe(true);
    expect(() => unregister()).not.toThrow();
  });

  it('keeps registering when one registration throws', () => {
    const registered: string[] = [];
    const api: ModelContextApi = {
      registerTool: (tool) => {
        if (tool.name === 'get_product') throw new Error('duplicate');
        registered.push(tool.name);
      },
    };
    Object.defineProperty(document, 'modelContext', { value: api, configurable: true });
    registerAgentTools();
    expect(registered).toHaveLength(AGENT_TOOLS.length - 1);
  });
});
