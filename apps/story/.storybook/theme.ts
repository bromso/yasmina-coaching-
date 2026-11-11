import { BRAND_NAME } from "@repo/sites"
import { create } from "storybook/theming/create"

/**
 * Custom Storybook theme for the manager chrome (toolbar, sidebar, panels).
 * The stories themselves render with the real tokens (`packages/tokens`, via
 * `packages/ui`'s stylesheet); this file does not.
 *
 * Note: Storybook theming uses hex/rgb values, not CSS variables, and these are the old
 * indigo/slate values from before the coaching look, not resolved from the current tokens.
 * Re-derive them with `@repo/tokens/color` (`toHex`) if the manager should match.
 */

// Light theme (default)
export const lightTheme = create({
  base: "light",

  // Brand
  brandTitle: `${BRAND_NAME} UI`,
  brandUrl: "/",
  brandTarget: "_self",
  // brandImage: "/logo.svg", // Add when available

  // Typography
  fontBase: '"Inter", system-ui, sans-serif',
  fontCode: '"JetBrains Mono", monospace',

  // Colors (see the note at the top)

  colorPrimary: "#5554de",
  colorSecondary: "#5554de",

  // UI backgrounds
  appBg: "#f8fafc",
  appContentBg: "#ffffff",
  appPreviewBg: "#ffffff",
  appBorderColor: "#e2e8f0",
  appBorderRadius: 8,

  // Text colors
  textColor: "#1e293b",
  textInverseColor: "#ffffff",
  textMutedColor: "#64748b",

  // Toolbar
  barTextColor: "#64748b",
  barHoverColor: "#5554de",
  barSelectedColor: "#5554de",
  barBg: "#ffffff",

  // Inputs
  inputBg: "#ffffff",
  inputBorder: "#e2e8f0",
  inputTextColor: "#1e293b",
  inputBorderRadius: 6,

  // Buttons
  buttonBg: "#f1f5f9",
  buttonBorder: "#e2e8f0",

  // Boolean inputs (checkboxes, toggles)
  booleanBg: "#f1f5f9",
  booleanSelectedBg: "#5554de",
})

// Dark theme
export const darkTheme = create({
  base: "dark",

  // Brand
  brandTitle: `${BRAND_NAME} UI`,
  brandUrl: "/",
  brandTarget: "_self",
  // brandImage: "/logo-dark.svg", // Add when available

  // Typography
  fontBase: '"Inter", system-ui, sans-serif',
  fontCode: '"JetBrains Mono", monospace',

  // Colors (see the note at the top)

  colorPrimary: "#818cf8",
  colorSecondary: "#818cf8",

  // UI backgrounds
  appBg: "#0f172a",
  appContentBg: "#1e293b",
  appPreviewBg: "#1e293b",
  appBorderColor: "#334155",
  appBorderRadius: 8,

  // Text colors
  textColor: "#e2e8f0",
  textInverseColor: "#0f172a",
  textMutedColor: "#94a3b8",

  // Toolbar
  barTextColor: "#94a3b8",
  barHoverColor: "#818cf8",
  barSelectedColor: "#818cf8",
  barBg: "#1e293b",

  // Inputs
  inputBg: "#1e293b",
  inputBorder: "#334155",
  inputTextColor: "#e2e8f0",
  inputBorderRadius: 6,

  // Buttons
  buttonBg: "#334155",
  buttonBorder: "#475569",

  // Boolean inputs
  booleanBg: "#334155",
  booleanSelectedBg: "#818cf8",
})
