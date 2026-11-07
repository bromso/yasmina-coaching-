import { Label } from "@repo/ui/components/label"
import { Switch } from "@repo/ui/components/switch"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    checked: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    "aria-label": "Toggle setting",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchEl = canvas.getByRole("switch")

    await expect(switchEl).toBeInTheDocument()
    await expect(switchEl).not.toBeChecked()

    await userEvent.click(switchEl)
    await expect(switchEl).toBeChecked()

    await userEvent.click(switchEl)
    await expect(switchEl).not.toBeChecked()
  },
}

export const Checked: Story = {
  args: {
    defaultChecked: true,
    "aria-label": "Toggle setting",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    "aria-label": "Toggle setting (disabled)",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchEl = canvas.getByRole("switch")

    await expect(switchEl).toBeDisabled()
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
    "aria-label": "Toggle setting (disabled)",
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const switchEl = canvas.getByRole("switch")
    const label = canvas.getByText("Airplane Mode")

    await expect(switchEl).not.toBeChecked()

    await userEvent.click(label)
    await expect(switchEl).toBeChecked()
  },
}

export const SettingsGroup: Story = {
  render: () => (
    <div className="space-y-4 w-[300px]">
      <div className="flex items-center justify-between">
        <Label htmlFor="dark-mode">Dark mode</Label>
        <Switch id="dark-mode" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="notifications">Notifications</Label>
        <Switch id="notifications" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="marketing">Marketing emails</Label>
        <Switch id="marketing" />
      </div>
    </div>
  ),
}
