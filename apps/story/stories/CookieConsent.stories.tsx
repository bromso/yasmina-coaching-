import { legalPath } from "@repo/sites/legal"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/CookieConsent",
  component: CookieConsent,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    privacyHref: `https://legal.brand.com${legalPath("privacy", "en")}`,
  },
} satisfies Meta<typeof CookieConsent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    document.cookie = "consent=; Max-Age=0; Path=/"
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole("button", { name: "Accept all" }))
    await waitFor(() =>
      expect(canvas.queryByRole("region", { name: "Cookie consent" })).not.toBeInTheDocument()
    )
    await expect(document.cookie).toContain("consent=all")
  },
}

export const NecessaryOnly: Story = {
  play: async ({ canvasElement }) => {
    document.cookie = "consent=; Max-Age=0; Path=/"
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole("button", { name: "Necessary only" }))
    await waitFor(() =>
      expect(canvas.queryByRole("region", { name: "Cookie consent" })).not.toBeInTheDocument()
    )
    await expect(document.cookie).toContain("consent=necessary")
  },
}

export const AlreadyDecided: Story = {
  args: { initial: "all" },
  play: async ({ canvasElement }) => {
    document.cookie = "consent=; Max-Age=0; Path=/"
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("region", { name: "Cookie consent" })).not.toBeInTheDocument()
  },
}
