import type { StorybookConfig } from "@storybook/react-vite"
import tailwindcss from "@tailwindcss/vite"

const config: StorybookConfig = {
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    "@storybook/addon-vitest",
  ],
  framework: "@storybook/react-vite",
  staticDirs: ["../public"],
  typescript: {
    // Use faster docgen (smaller bundle than react-docgen-typescript)
    reactDocgen: "react-docgen",
  },
  viteFinal: async (config) => {
    // Add Tailwind CSS v4 Vite plugin
    config.plugins = [...(config.plugins ?? []), tailwindcss()]
    config.build = {
      ...config.build,
      // Storybook core is ~662 kB, suppress warning for this dev tool
      chunkSizeWarningLimit: 700,
    }
    return config
  },
}

export default config
