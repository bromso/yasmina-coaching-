---
"@repo/typescript-config": patch
---

Use `module: ESNext` and `moduleResolution: Bundler` in the shared React library config. Its consumers — `apps/story` and `packages/ui` — are consumed through bundlers (Vite for Storybook, Next.js for the apps), so Node-flavoured resolution was wrong for them. Removes 109 type errors, including all 103 `TS2305` "no exported member" errors caused by `ogl` re-exporting without file extensions.
