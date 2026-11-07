import path from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vite"
import type { ViteUserConfig } from "vitest/config"

// Vitest 4 resolves its own Vite (8), so its `test` augmentation of `UserConfig` lands on that
// copy, not on the Vite 6 this config imports. Augment Vite 6 with the same type; type-only, so
// Storybook and Vitest load exactly the config they did before. Remove it once story and Vitest
// share one Vite copy: Vitest's own `test?:` declaration would then clash with this one (TS2717).
declare module "vite" {
  interface UserConfig {
    test?: ViteUserConfig["test"]
  }
}

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Storybook core chunk is ~662 kB, suppress warning for this dev tool
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large vendor dependencies into separate chunks
          recharts: ["recharts"],
          "react-vendor": ["react", "react-dom"],
          "react-hook-form": ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: "chromium",
              },
            ],
          },
          setupFiles: [".storybook/vitest.setup.ts"],
          // WebGL-heavy stories (Ballpit, LiquidChrome, Galaxy, Prism, FloatingLines…) render
          // via software rasterisation on GPU-less CI runners: 10–20 s each, against Vitest's
          // 15 s default. A newer Chromium (Playwright 1.63) pushed four of them over it. The
          // timeout only bounds how long a story may take, not what it asserts, so it is sized
          // for software GL; a genuinely hung story still fails, just later. Retrying is
          // preferable to excluding stories, which would trade real coverage for stability.
          testTimeout: 60_000,
          retry: 2,
          // Note: Coverage collection is disabled for browser-based Storybook tests
          // because tracking coverage of external workspace packages (@repo/ui)
          // from bundled browser code has significant limitations.
          // For component coverage, consider using unit tests directly in packages/ui.
        },
      },
    ],
  },
})
