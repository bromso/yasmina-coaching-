import { Toggle } from "@repo/ui/components/animate-ui/components/radix/toggle"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Toggle",
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
  args: {
    children: "Toggle",
  },
}

export const WithIcon: Story = {
  render: (args) => (
    <Toggle aria-label="Toggle bold" {...args}>
      <Icon icon="lucide:bold" className="size-4" />
    </Toggle>
  ),
}

export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline",
  },
}

export const Small: Story = {
  render: () => (
    <Toggle size="sm" aria-label="Toggle italic">
      <Icon icon="lucide:italic" className="size-4" />
    </Toggle>
  ),
}

export const Large: Story = {
  render: () => (
    <Toggle size="lg" aria-label="Toggle underline">
      <Icon icon="lucide:underline" className="size-4" />
    </Toggle>
  ),
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
}

export const Pressed: Story = {
  render: () => (
    <Toggle defaultPressed aria-label="Toggle bold">
      <Icon icon="lucide:bold" className="size-4" />
      Bold
    </Toggle>
  ),
}

export const TextFormatting: Story = {
  render: () => (
    <div className="flex gap-1">
      <Toggle aria-label="Toggle bold" size="sm">
        <Icon icon="lucide:bold" className="size-4" />
      </Toggle>
      <Toggle aria-label="Toggle italic" size="sm">
        <Icon icon="lucide:italic" className="size-4" />
      </Toggle>
      <Toggle aria-label="Toggle underline" size="sm">
        <Icon icon="lucide:underline" className="size-4" />
      </Toggle>
    </div>
  ),
}
