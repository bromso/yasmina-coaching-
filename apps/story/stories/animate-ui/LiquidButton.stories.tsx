import { LiquidButton } from "@repo/ui/components/animate-ui/components/buttons/liquid"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Buttons/LiquidButton",
  component: LiquidButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "secondary", "ghost"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon", "icon-sm", "icon-lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    variant: "default",
    size: "default",
    children: "Liquid Button",
  },
} satisfies Meta<typeof LiquidButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete",
  },
}

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
}

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large",
  },
}

export const IconSize: Story = {
  args: {
    size: "icon",
    children: <Icon icon="lucide:download" className="size-4" />,
  },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        Get Started
        <Icon icon="lucide:arrow-right" className="size-4" />
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <LiquidButton variant="default">Default</LiquidButton>
      <LiquidButton variant="destructive">Destructive</LiquidButton>
      <LiquidButton variant="secondary">Secondary</LiquidButton>
      <LiquidButton variant="ghost">Ghost</LiquidButton>
    </div>
  ),
}
