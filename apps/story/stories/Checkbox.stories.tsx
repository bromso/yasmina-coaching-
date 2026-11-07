import { Checkbox } from "@repo/ui/components/checkbox"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Checkbox",
  component: Checkbox,
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
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    "aria-label": "Accept terms",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole("checkbox")

    await expect(checkbox).toBeInTheDocument()
    await expect(checkbox).not.toBeChecked()

    await userEvent.click(checkbox)
    await expect(checkbox).toBeChecked()

    await userEvent.click(checkbox)
    await expect(checkbox).not.toBeChecked()
  },
}

export const Checked: Story = {
  args: {
    defaultChecked: true,
    "aria-label": "Accept terms",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    "aria-label": "Accept terms (disabled)",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole("checkbox")

    await expect(checkbox).toBeDisabled()
  },
}

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
    "aria-label": "Accept terms (disabled)",
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const checkbox = canvas.getByRole("checkbox")
    const label = canvas.getByText("Accept terms and conditions")

    await expect(checkbox).not.toBeChecked()

    await userEvent.click(label)
    await expect(checkbox).toBeChecked()
  },
}

export const FormGroup: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox id="email-notifications" defaultChecked />
        <Label htmlFor="email-notifications">Email notifications</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="sms-notifications" />
        <Label htmlFor="sms-notifications">SMS notifications</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="push-notifications" defaultChecked />
        <Label htmlFor="push-notifications">Push notifications</Label>
      </div>
    </div>
  ),
}
