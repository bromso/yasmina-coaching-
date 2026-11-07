import { RainbowButton } from "@repo/ui/components/magicui/rainbow-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Buttons/RainbowButton",
  component: RainbowButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
      description: "Visual style variant of the button",
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
      description: "Size of the button",
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
    asChild: {
      control: "boolean",
      description: "Whether to render as a child component using Radix Slot",
    },
  },
  args: {
    variant: "default",
    size: "default",
    disabled: false,
  },
} satisfies Meta<typeof RainbowButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Rainbow Button",
  },
}

export const Outline: Story = {
  args: {
    children: "Outline Rainbow",
    variant: "outline",
  },
}

export const Small: Story = {
  args: {
    children: "Small",
    size: "sm",
  },
}

export const Large: Story = {
  args: {
    children: "Large Rainbow Button",
    size: "lg",
  },
}

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-4">
        <RainbowButton>Default</RainbowButton>
        <RainbowButton variant="outline">Outline</RainbowButton>
      </div>
      <div className="flex items-center gap-4">
        <RainbowButton size="sm">Small</RainbowButton>
        <RainbowButton size="default">Default</RainbowButton>
        <RainbowButton size="lg">Large</RainbowButton>
      </div>
    </div>
  ),
}
