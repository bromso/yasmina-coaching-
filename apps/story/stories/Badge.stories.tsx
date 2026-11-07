import { Badge } from "@repo/ui/components/badge"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Badge",
    variant: "default",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = canvas.getByText("Badge")

    await expect(badge).toBeInTheDocument()
  },
}

export const Secondary: Story = {
  args: {
    children: "Secondary",
    variant: "secondary",
  },
}

export const Destructive: Story = {
  args: {
    children: "Destructive",
    variant: "destructive",
  },
}

export const Outline: Story = {
  args: {
    children: "Outline",
    variant: "outline",
  },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Icon icon="lucide:check" aria-hidden="true" />
        Verified
      </>
    ),
  },
}

export const Status: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">
        <Icon icon="lucide:check" aria-hidden="true" />
        Active
      </Badge>
      <Badge variant="secondary">Pending</Badge>
      <Badge variant="destructive">
        <Icon icon="lucide:x" aria-hidden="true" />
        Failed
      </Badge>
      <Badge variant="outline">
        <Icon icon="lucide:alert-circle" aria-hidden="true" />
        Warning
      </Badge>
    </div>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
}
