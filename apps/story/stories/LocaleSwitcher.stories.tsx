import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/LocaleSwitcher",
  component: LocaleSwitcher,
  tags: ["autodocs"],
  args: {
    current: "en",
    // Each language named in itself, as the apps pass LOCALE_NAMES from @repo/i18n.
    options: [
      { value: "en", label: "English" },
      { value: "sv", label: "Svenska" },
    ],
  },
} satisfies Meta<typeof LocaleSwitcher>

export default meta
type Story = StoryObj<typeof meta>

/** Signed-in apps: a server action, posted by the button — never by the select's own change. */
export const WithAction: Story = {
  args: { action: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const select = canvas.getByRole("combobox", { name: "Language" })
    await expect(select).toHaveValue("en")
    await userEvent.selectOptions(select, "sv")
    await expect(args.action).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole("button", { name: "Change" }))
    await waitFor(() => expect(args.action).toHaveBeenCalledTimes(1))
    const formData = (args.action as ReturnType<typeof fn>).mock.calls[0]?.[0] as FormData
    await expect(formData.get("locale")).toBe("sv")
  },
}

/** Static apps: no form; the button reports the pick, the select's change does not. */
export const WithOnChange: Story = {
  args: { onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Language" }), "sv")
    await expect(args.onChange).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByRole("button", { name: "Change" }))
    await expect(args.onChange).toHaveBeenCalledWith("sv")
    await expect(canvasElement.querySelector("form")).toBeNull()
  },
}

export const Swedish: Story = {
  args: { current: "sv", label: "Språk", submitLabel: "Byt", action: fn() },
}
