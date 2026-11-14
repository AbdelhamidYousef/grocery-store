// Vercel Function: the whole Express API (apps/api) behind /api/*. The API is built to
// apps/api/dist/vercel.js by the build command in ../vercel.json; vercel.json rewrites every
// /api/... request here, and Express routes on the original URL.
// eslint-disable-next-line import/no-default-export -- Vercel calls the default export
export { default } from '../../api/dist/vercel.js';
