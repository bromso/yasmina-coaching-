import { StaticLocaleSwitcher } from "@repo/ui/components/static-locale-switcher"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/StaticLocaleSwitcher",
  component: StaticLocaleSwitcher,
  tags: ["autodocs"],
  args: {
    // Each language named in itself, as the static apps pass LOCALE_NAMES from @repo/i18n.
    options: [
      { value: "en", label: "English" },
      { value: "sv", label: "Svenska" },
    ],
  },
} satisfies Meta<typeof StaticLocaleSwitcher>

export default meta
type Story = StoryObj<typeof meta>

/** No server action, no form: picking a language writes the cookie and shows the saved note. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    document.cookie = "locale=; Max-Age=0; Path=/"
    const canvas = within(canvasElement)
    const select = await canvas.findByRole("combobox", { name: "Language" })
    await expect(select).toHaveValue("en")
    await userEvent.selectOptions(select, "sv")
    await userEvent.click(canvas.getByRole("button", { name: "Change" }))
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("Saved — signed-in pages will use it.")
    )
    await expect(document.cookie).toContain("locale=sv")
  },
}

/** The cookie, when one is already there, wins over the fallback. */
export const CookieAlreadySwedish: Story = {
  play: async ({ canvasElement }) => {
    document.cookie = "locale=sv; Path=/"
    const canvas = within(canvasElement)
    await waitFor(async () =>
      expect(await canvas.findByRole("combobox", { name: "Language" })).toHaveValue("sv")
    )
    document.cookie = "locale=; Max-Age=0; Path=/"
  },
}
