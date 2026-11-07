import { Magnetic } from "@repo/ui/components/animate-ui/primitives/effects/magnetic"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Magnetic",
  component: Magnetic,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    strength: {
      control: { type: "number", min: 0, max: 2, step: 0.1 },
    },
    range: {
      control: { type: "number", min: 20, max: 400, step: 10 },
    },
    onlyOnHover: {
      control: "boolean",
    },
    disableOnTouch: {
      control: "boolean",
    },
  },
  args: {
    strength: 0.5,
    range: 120,
    onlyOnHover: false,
    disableOnTouch: true,
  },
} satisfies Meta<typeof Magnetic>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Magnetic {...args}>
      <button
        type="button"
        className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm"
      >
        Magnetic Button
      </button>
    </Magnetic>
  ),
}

export const StrongPull: Story = {
  render: (args) => (
    <Magnetic {...args}>
      <button
        type="button"
        className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm"
      >
        Strong Magnetic
      </button>
    </Magnetic>
  ),
  args: {
    strength: 1.5,
    range: 200,
  },
}

export const HoverOnly: Story = {
  render: (args) => (
    <Magnetic {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm cursor-pointer">
        <h3 className="text-lg font-semibold">Hover Only</h3>
        <p className="text-sm text-muted-foreground">Magnetic effect only when hovering.</p>
      </div>
    </Magnetic>
  ),
  args: {
    onlyOnHover: true,
  },
}

export const SmallRange: Story = {
  render: (args) => (
    <Magnetic {...args}>
      <div className="rounded-full bg-muted flex size-16 items-center justify-center text-sm font-medium">
        Tight
      </div>
    </Magnetic>
  ),
  args: {
    range: 50,
    strength: 0.8,
  },
}
