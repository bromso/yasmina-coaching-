import { Click, type ClickProps } from "@repo/ui/components/animate-ui/primitives/effects/click"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Click",
  component: Click,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["ring", "ripple", "crosshair", "burst", "particles"],
    },
    color: {
      control: "color",
    },
    size: {
      control: { type: "number", min: 20, max: 300, step: 10 },
    },
    duration: {
      control: { type: "number", min: 100, max: 2000, step: 100 },
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    variant: "ring",
    color: "currentColor",
    size: 100,
    duration: 400,
    disabled: false,
  },
} satisfies Meta<typeof Click>

export default meta
type Story = StoryObj<typeof meta>
// Click is overloaded: `typeof Click` resolves to its SVG variants only, so the ripple story
// (a `div` overlay) takes the ripple overload's props instead.
type RippleStory = StoryObj<Extract<ClickProps, { variant: "ripple" }>>

export const Default: Story = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">
          Click anywhere on this page to see the ring effect.
        </p>
      </div>
    </Click>
  ),
}

export const Ripple: RippleStory = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">Click anywhere for a ripple effect.</p>
      </div>
    </Click>
  ),
  args: {
    variant: "ripple",
  },
}

export const Crosshair: Story = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">Click for a crosshair effect.</p>
      </div>
    </Click>
  ),
  args: {
    variant: "crosshair",
  },
}

export const Burst: Story = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">Click for a burst effect.</p>
      </div>
    </Click>
  ),
  args: {
    variant: "burst",
  },
}

export const Particles: Story = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">Click for a particles effect.</p>
      </div>
    </Click>
  ),
  args: {
    variant: "particles",
  },
}

export const CustomColorAndSize: Story = {
  render: (args) => (
    <Click {...args}>
      <div className="rounded-lg border bg-card p-12 text-card-foreground shadow-sm text-center">
        <p className="text-sm text-muted-foreground">Large blue ring on click.</p>
      </div>
    </Click>
  ),
  args: {
    color: "#3b82f6",
    size: 200,
    duration: 600,
  },
}
