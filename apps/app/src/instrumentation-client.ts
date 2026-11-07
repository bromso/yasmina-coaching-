import { z } from "zod"

// Runs before any app code. Zod's fast path probes `new Function("")` when a schema is created;
// the CSP has no 'unsafe-eval', so browsers would report that probe (Zod catches it and falls
// back anyway). Parsing jitless in the browser avoids the report; the services keep the JIT.
z.config({ jitless: true })
