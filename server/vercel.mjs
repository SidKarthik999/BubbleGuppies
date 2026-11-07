// Entrypoint for the "api" Vercel service (see /vercel.json).
// Vercel provides the HTTP server, so this exports the request handler
// instead of calling listen(). Local development still uses `npm run api`
// (server/index.mjs). OPENROUTER_API_KEY and the other server/.env settings
// come from the Vercel project's environment variables.
//
// Requests arrive with their original path (/api/analyze, ...), which is
// what the router in server/index.mjs expects.

import { createHandler } from "./index.mjs";

export default createHandler();
