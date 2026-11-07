import { Slide, Slides } from "@repo/ui/components/animate-ui/primitives/effects/slide"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Slide",
  component: Slide,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    direction: {
      control: "select",
      options: ["up", "down", "left", "right"],
    },
    offset: {
      control: { type: "number", min: 0, max: 500, step: 10 },
    },
    delay: {
      control: { type: "number", min: 0, max: 2000, step: 100 },
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    direction: "up",
    offset: 100,
    delay: 0,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Slide>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Slide {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Slide Up</h3>
        <p className="text-sm text-muted-foreground">This content slides up into view.</p>
      </div>
    </Slide>
  ),
}

export const SlideDown: Story = {
  render: (args) => (
    <Slide {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Slide Down</h3>
        <p className="text-sm text-muted-foreground">Slides down into position.</p>
      </div>
    </Slide>
  ),
  args: {
    direction: "down",
  },
}

export const SlideLeft: Story = {
  render: (args) => (
    <Slide {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Slide Left</h3>
        <p className="text-sm text-muted-foreground">Slides from the right.</p>
      </div>
    </Slide>
  ),
  args: {
    direction: "left",
  },
}

export const SlideRight: Story = {
  render: (args) => (
    <Slide {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Slide Right</h3>
        <p className="text-sm text-muted-foreground">Slides from the left.</p>
      </div>
    </Slide>
  ),
  args: {
    direction: "right",
  },
}

export const LargeOffset: Story = {
  render: (args) => (
    <Slide {...args}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Large Offset</h3>
        <p className="text-sm text-muted-foreground">Slides from 300px away.</p>
      </div>
    </Slide>
  ),
  args: {
    offset: 300,
  },
}

export const StaggeredList: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Slides holdDelay={150} direction="left">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 1</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 2</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 3</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 4</div>
      </Slides>
    </div>
  ),
}
