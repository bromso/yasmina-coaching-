import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/LocaleSwitcher",
  component: LocaleSwitcher,
  tags: ["autodocs"],
  args: {
    current: "en",
    // Each language named in itself, as the apps pass LOCALE_NAMES from @repo/i18n; the flags
    // come from LOCALE_FLAGS (circle-flags:gb / circle-flags:se), bundled offline.
    options: [
      { value: "en", label: "English" },
      { value: "sv", label: "Svenska" },
    ],
  },
  // Room below the trigger for the open menu.
  decorators: [
    (Story) => (
      <div className="flex min-h-48 justify-end p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LocaleSwitcher>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)

/** Closed: a menu button showing the current language's flag and name. */
export const Closed: Story = {
  args: { action: fn() },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Language: English" })
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu")
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    // The flag is decorative: hidden from assistive technology, the name carries the meaning.
    await expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    await expect(trigger.offsetHeight).toBeGreaterThanOrEqual(44)
  },
}

/** Open: every language with its flag, named in its own language, the current one marked. */
export const Open: Story = {
  args: { action: fn() },
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Language: English" })
    await userEvent.click(trigger)
    const menu = await body().findByRole("menu")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const items = within(menu).getAllByRole("menuitem")
    await expect(items).toHaveLength(2)
    const english = within(menu).getByRole("menuitem", { name: "English" })
    const swedish = within(menu).getByRole("menuitem", { name: "Svenska" })
    await expect(english).toHaveAttribute("aria-current", "true")
    await expect(swedish).not.toHaveAttribute("aria-current")
    await expect(swedish).toHaveAttribute("lang", "sv")
    // offsetHeight: the layout size, not the entrance animation's scaled box.
    for (const item of items) await expect(item.offsetHeight).toBeGreaterThanOrEqual(44)
    // Opening the menu changes nothing.
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/**
 * Signed-in apps: activating a language posts the server action at once (`locale` in the form
 * data). No separate button, and nothing on merely moving through the list (WCAG 3.2.2).
 */
export const SignedInForm: Story = {
  args: { action: fn() },
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Language: English" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const menu = await body().findByRole("menu")
    await userEvent.keyboard("{ArrowDown}")
    await userEvent.keyboard("{ArrowUp}")
    await expect(args.action).not.toHaveBeenCalled()
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Svenska" }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = (args.action as ReturnType<typeof fn>).mock.calls[0]?.[0] as FormData
    await expect(formData.get("locale")).toBe("sv")
    await waitFor(() => expect(body().queryByRole("menu")).toBeNull())
  },
}

/** Keyboard: Escape closes and returns focus to the trigger; Tab closes and moves on. */
export const Keyboard: Story = {
  args: { action: fn() },
  decorators: [
    (Story) => (
      <div className="flex items-start gap-2">
        <Story />
        <button type="button">After</button>
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Language: English" })
    trigger.focus()
    await userEvent.keyboard(" ")
    await body().findByRole("menu")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(body().queryByRole("menu")).toBeNull())
    await expect(trigger).toHaveFocus()

    await userEvent.keyboard("{Enter}")
    await body().findByRole("menu")
    await userEvent.keyboard("{Tab}")
    await waitFor(() => expect(body().queryByRole("menu")).toBeNull())
    await waitFor(() => expect(canvas.getByRole("button", { name: "After" })).toHaveFocus())
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Static apps: no form; activating a language reports it through `onChange`. */
export const WithOnChange: Story = {
  args: { onChange: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Language: English" }))
    const menu = await body().findByRole("menu")
    await expect(menu.querySelector("form")).toBeNull()
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Svenska" }))
    await expect(args.onChange).toHaveBeenCalledWith("sv")
    await expect(canvasElement.querySelector("form")).toBeNull()
  },
}

/** In Swedish: the caller passes its own label. */
export const Swedish: Story = {
  args: { current: "sv", label: "Språk", action: fn() },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Språk: Svenska" })
    ).toBeInTheDocument()
  },
}
