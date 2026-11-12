import { StaticLocaleSwitcher } from "@repo/ui/components/static-locale-switcher"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const clearCookie = () => {
  document.cookie = "locale=; Max-Age=0; Path=/"
}

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
  decorators: [
    (Story) => (
      <div className="flex min-h-48 justify-end p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaticLocaleSwitcher>

export default meta
type Story = StoryObj<typeof meta>

/** No server action, no form: choosing a language writes the cookie and shows the saved note. */
export const Default: Story = {
  beforeEach: () => {
    clearCookie()
    return clearCookie
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole("button", { name: "Language: English" }))
    const menu = await within(document.body).findByRole("menu")
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Svenska" }))
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("Saved — signed-in pages will use it.")
    )
    await expect(document.cookie).toContain("locale=sv")
    // The trigger follows the choice (findBy: the closing menu hides the page from AT until gone).
    await expect(
      await canvas.findByRole("button", { name: "Language: Svenska" })
    ).toBeInTheDocument()
  },
}

/** The cookie, when one is already there, wins over the fallback. */
export const CookieAlreadySwedish: Story = {
  beforeEach: () => {
    document.cookie = "locale=sv; Path=/"
    return clearCookie
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: "Language: Svenska" })
    ).toBeInTheDocument()
  },
}
