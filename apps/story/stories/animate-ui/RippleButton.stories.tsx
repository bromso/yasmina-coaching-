import {
  RippleButton,
  RippleButtonRipples,
} from "@repo/ui/components/animate-ui/components/buttons/ripple"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"

const meta = {
  title: "Animate UI/Buttons/RippleButton",
  component: RippleButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "accent", "destructive", "outline", "secondary", "ghost", "link"],
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
  },
} satisfies Meta<typeof RippleButton>

export default meta
// RippleButton takes a union of props: an `asChild` variant, whose only child must be one element,
// and a plain one. Every story renders RippleButton itself around several children, so stories take
// the plain variant's props.
type Story = StoryObj<Extract<ComponentProps<typeof RippleButton>, { asChild?: false }>>

export const Default: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Click Me
      <RippleButtonRipples />
    </RippleButton>
  ),
}

export const Outline: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Outline
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    variant: "outline",
  },
}

export const Destructive: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Delete
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    variant: "destructive",
  },
}

export const Secondary: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Secondary
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    variant: "secondary",
  },
}

export const Ghost: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Ghost
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    variant: "ghost",
  },
}

export const WithIcon: Story = {
  render: (args) => (
    <RippleButton {...args}>
      <Icon icon="lucide:send" className="size-4" />
      Send
      <RippleButtonRipples />
    </RippleButton>
  ),
}

export const Small: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Small
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    size: "sm",
  },
}

export const Large: Story = {
  render: (args) => (
    <RippleButton {...args}>
      Large
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    size: "lg",
  },
}

export const IconSize: Story = {
  render: (args) => (
    <RippleButton {...args}>
      <Icon icon="lucide:zap" className="size-4" />
      <RippleButtonRipples />
    </RippleButton>
  ),
  args: {
    size: "icon",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(["default", "accent", "destructive", "outline", "secondary", "ghost"] as const).map(
        (variant) => (
          <RippleButton key={variant} variant={variant}>
            {variant}
            <RippleButtonRipples />
          </RippleButton>
        )
      )}
    </div>
  ),
}
