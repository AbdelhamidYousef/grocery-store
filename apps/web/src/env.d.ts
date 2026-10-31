/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for builds that do not proxy /api (leave unset in dev and on Vercel). */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
