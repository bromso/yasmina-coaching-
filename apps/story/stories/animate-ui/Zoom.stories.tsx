import { Zoom, Zooms } from "@repo/ui/components/animate-ui/primitives/effects/zoom"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Zoom",
  component: Zoom,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delay: {
      control: { type: "number", min: 0, max: 2000, step: 100 },
    },
    initialScale: {
      control: { type: "number", min: 0, max: 2, step: 0.1 },
    },
    scale: {
      control: { type: "number", min: 0, max: 2, step: 0.1 },
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    delay: 0,
    initialScale: 0.5,
    scale: 1,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Zoom>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Zoom {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Zoom In</h3>
        <p className="text-sm text-muted-foreground">This content zooms into view.</p>
      </div>
    </Zoom>
  ),
}

export const FromZero: Story = {
  render: (args) => (
    <Zoom {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">From Zero</h3>
        <p className="text-sm text-muted-foreground">Scales from 0 to full size.</p>
      </div>
    </Zoom>
  ),
  args: {
    initialScale: 0,
  },
}

export const ZoomOut: Story = {
  render: (args) => (
    <Zoom {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Zoom Out</h3>
        <p className="text-sm text-muted-foreground">Scales from 1.5x down to normal.</p>
      </div>
    </Zoom>
  ),
  args: {
    initialScale: 1.5,
    scale: 1,
  },
}

export const StaggeredGrid: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <Zooms holdDelay={100}>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm text-center">
          1
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm text-center">
          2
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm text-center">
          3
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm text-center">
          4
        </div>
      </Zooms>
    </div>
  ),
}
