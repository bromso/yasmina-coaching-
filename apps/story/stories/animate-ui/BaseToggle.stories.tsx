import { Toggle } from "@repo/ui/components/animate-ui/components/base/toggle"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Toggle",
  component: Toggle,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    variant: "default",
    size: "default",
  },
} satisfies Meta<typeof Toggle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const WithText: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle italic" {...args}>
      <Icon icon="lucide:italic" className="size-4" />
      Italic
    </Toggle>
  ),
}

export const OutlineVariant: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" {...args} variant="outline">
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const Pressed: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" defaultPressed {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const Disabled: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" disabled {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const Small: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" size="sm" {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const Large: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" size="lg" {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}
