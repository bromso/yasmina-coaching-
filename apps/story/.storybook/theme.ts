import { BRAND_NAME } from "@repo/sites"
import { create } from "storybook/theming/create"

/**
 * Custom Storybook theme that matches the design system.
 * Colors are derived from the design tokens in globals.css
 *
 * Note: Storybook theming uses hex/rgb values, not CSS variables.
 * These are the resolved values from your oklch tokens.
 */

// Light theme (default)
export const lightTheme = create({
  base: "light",

  // Brand
  brandTitle: `${BRAND_NAME} UI`,
  brandUrl: "/",
  brandTarget: "_self",
  // brandImage: "/logo.svg", // Add when available

  // Typography - matches your design tokens
  fontBase: '"Inter", system-ui, sans-serif',
  fontCode: '"JetBrains Mono", monospace',

  // Colors derived from your oklch tokens
  // --primary: oklch(0.53 0.2041 277.1173) ≈ #5554de (indigo)
  // --background: oklch(0.9842 0.0034 247.8575) ≈ #f8fafc
  // --foreground: oklch(0.2795 0.0368 260.031) ≈ #1e293b
  // --muted: oklch(0.967 0.0029 264.5419) ≈ #f1f5f9
  // --border: oklch(0.8717 0.0093 258.3382) ≈ #e2e8f0

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

  // Colors derived from your dark mode oklch tokens
  // --primary: oklch(0.6801 0.1583 276.9349) ≈ #818cf8
  // --background: oklch(0.2077 0.0398 265.7549) ≈ #0f172a
  // --foreground: oklch(0.9288 0.0126 255.5078) ≈ #e2e8f0
  // --card: oklch(0.2795 0.0368 260.031) ≈ #1e293b
  // --border: oklch(0.4461 0.0263 256.8018) ≈ #334155

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
