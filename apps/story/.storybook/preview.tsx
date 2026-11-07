import { withThemeByClassName } from "@storybook/addon-themes"
import type { Decorator, Preview, ReactRenderer } from "@storybook/react-vite"

import "@repo/ui/globals.css"
import "./storybook.css"
import { lightTheme } from "./theme"

/**
 * Story container that provides proper background and padding.
 * Uses the design system's background color which changes with theme.
 */
const withStoryContainer: Decorator = (Story, context) => {
  // Check if the story has layout: "fullscreen" - if so, don't add padding
  const isFullscreen = context.parameters?.layout === "fullscreen"

  return (
    <div className={`text-foreground antialiased ${isFullscreen ? "" : "p-6"}`}>
      <Story />
    </div>
  )
}

const preview: Preview = {
  tags: ["a11y-test"],
  parameters: {
    // Docs page configuration
    docs: {
      theme: lightTheme,
      codeEditorUrl: "vscode://file/%s:%l:%c",
    },
    a11y: {
      // axe-core configuration options
      config: {
        rules: [
          {
            // Disable color-contrast rule for components that rely on CSS variables
            // as axe-core cannot resolve them correctly
            id: "color-contrast",
            enabled: true,
          },
        ],
      },
      // Optional: specify elements to include/exclude from a11y checks
      options: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disabled: true,
    },
    layout: "fullscreen",
  },
  decorators: [
    // Apply theme class to html element for CSS variable switching
    withThemeByClassName<ReactRenderer>({
      themes: {
        light: "",
        dark: "dark",
      },
      defaultTheme: "light",
      parentSelector: "html",
    }),
    // Wrap stories in a container with proper background and spacing
    withStoryContainer,
  ],
}

export default preview
