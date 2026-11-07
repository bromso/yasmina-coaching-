import { TwoFactorRequiredNotice } from "@repo/ui/blocks/two-factor-required-notice"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/TwoFactorRequiredNotice",
  component: TwoFactorRequiredNotice,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    title: "Two-step verification required",
    body: "Acme requires two-step verification. Turn it on, or add a passkey, to continue.",
    setupHref: "#security",
    setupLabel: "Set up two-step verification",
  },
} satisfies Meta<typeof TwoFactorRequiredNotice>

export default meta
type Story = StoryObj<typeof meta>

/** The member belongs to other workspaces: one switch button each, then leave. */
export const WithOtherWorkspaces: Story = {
  render: (args) => (
    <TwoFactorRequiredNotice
      {...args}
      switchSlot={
        <ul className="grid gap-2">
          {["Beta", "Gamma"].map((name) => (
            <li key={name}>
              <Button type="button" variant="outline" size="sm">
                Switch to {name}
              </Button>
            </li>
          ))}
        </ul>
      }
      leaveSlot={
        <Button type="button" variant="outline" size="sm">
          Leave Acme
        </Button>
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Two-step verification required"
    )
    await expect(canvas.getByRole("link", { name: "Set up two-step verification" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Switch to Beta" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Leave Acme" })).toBeVisible()
  },
}

/** The only workspace: a link to create another in place of the switch buttons. */
export const OnlyWorkspace: Story = {
  render: (args) => (
    <TwoFactorRequiredNotice
      {...args}
      switchSlot={
        <a className="text-sm underline" href="#new">
          Create another workspace
        </a>
      }
      leaveSlot={
        <Button type="button" variant="outline" size="sm">
          Leave Acme
        </Button>
      }
    />
  ),
}

/** No slots: only the setup link. */
export const SetupOnly: Story = {}
