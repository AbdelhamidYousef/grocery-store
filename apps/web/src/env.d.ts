/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for builds that do not proxy /api (leave unset in dev and on Vercel). */
  readonly VITE_API_URL?: string;
  /** Stripe publishable key (`pk_test_...` only). Without it the payment step says payments are
   * not configured and no order can be placed. */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// WebMCP is an unfinished W3C Web Machine Learning CG draft, so its types are declared here by
// hand with every member optional: code must probe before it calls. Only
// `features/agent/webmcp.ts` touches this. The draft puts the entry point on `document`; older
// Chrome previews used `navigator` (deprecated), so both are declared.
interface ModelContextTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
}
interface ModelContextApi {
  registerTool?: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => unknown;
  /** Older previews only; the draft unregisters by aborting the signal given to registerTool. */
  unregisterTool?: (name: string) => unknown;
}
interface Document {
  modelContext?: ModelContextApi;
}
interface Navigator {
  modelContext?: ModelContextApi;
}
