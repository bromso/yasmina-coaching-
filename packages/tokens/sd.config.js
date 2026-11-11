// `bun run tokens` (or `bun --filter @repo/tokens build`): regenerates the theme stylesheet, the
// email constants and Storybook's dist/json from src/tokens. The config lives in src/generate.ts.
import { build } from "./src/generate.ts"

await build()
