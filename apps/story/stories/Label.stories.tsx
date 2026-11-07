import { Checkbox } from "@repo/ui/components/checkbox"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Label",
  component: Label,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Your email address",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const label = canvas.getByText("Your email address")
    await expect(label).toBeInTheDocument()
  },
}

export const WithInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
}

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
}

export const Required: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="name">
        Name <span className="text-destructive">*</span>
      </Label>
      <Input id="name" placeholder="Enter your name" />
    </div>
  ),
}

export const WithDescription: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="password">Password</Label>
      <Input type="password" id="password" placeholder="Enter password" />
      <p className="text-muted-foreground text-sm">Must be at least 8 characters.</p>
    </div>
  ),
}
