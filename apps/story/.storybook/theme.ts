import { EMAIL_COLORS as color, EMAIL_FONTS } from "@repo/email/tokens"
import { BRAND_NAME } from "@repo/sites"
import { create } from "storybook/theming/create"

/**
 * The Storybook manager's chrome (toolbar, sidebar, panels) in the coaching palette. The stories
 * themselves render with the real tokens (`packages/tokens`, via `packages/ui`'s stylesheet).
 *
 * Storybook theming takes hex, not CSS variables, so the colours come from the light palette as
 * the token build writes it in sRGB hex for mail (`@repo/email/tokens`, generated from
 * `packages/tokens`): a token edit plus `bun run tokens` re-colours the manager too. The manager
 * has one theme, the light one; the preview follows its own light/dark toolbar toggle.
 */
export const lightTheme = create({
  base: "light",

  // Brand
  brandTitle: `${BRAND_NAME} UI`,
  brandUrl: "/",
  brandTarget: "_self",

  // Typography: the manager loads no web font, so the system sans the mails use.
  fontBase: EMAIL_FONTS.body,
  fontCode: '"JetBrains Mono", monospace',

  colorPrimary: color.primary,
  colorSecondary: color.brandBlue,

  // UI backgrounds
  appBg: color.muted,
  appContentBg: color.background,
  appPreviewBg: color.background,
  appBorderColor: color.border,
  appBorderRadius: 8,

  // Text colors
  textColor: color.foreground,
  textInverseColor: color.primaryForeground,
  textMutedColor: color.mutedForeground,

  // Toolbar
  barTextColor: color.mutedForeground,
  barHoverColor: color.brandBlue,
  barSelectedColor: color.brandBlue,
  barBg: color.background,

  // Inputs
  inputBg: color.background,
  inputBorder: color.border,
  inputTextColor: color.foreground,
  inputBorderRadius: 6,

  // Buttons
  buttonBg: color.muted,
  buttonBorder: color.border,

  // Boolean inputs (checkboxes, toggles)
  booleanBg: color.muted,
  booleanSelectedBg: color.primary,
})
