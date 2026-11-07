import { Effect, Effects } from "@repo/ui/components/animate-ui/primitives/effects/effect"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Effect",
  component: Effect,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
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
    delay: 0,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Effect>

export default meta
type Story = StoryObj<typeof meta>

export const FadeOnly: Story = {
  render: (args) => (
    <Effect {...args} fade>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Fade Effect</h3>
        <p className="text-sm text-muted-foreground">Uses the combined Effect component.</p>
      </div>
    </Effect>
  ),
}

export const SlideAndFade: Story = {
  render: (args) => (
    <Effect {...args} slide fade>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Slide + Fade</h3>
        <p className="text-sm text-muted-foreground">
          Combines slide and fade for a polished entrance.
        </p>
      </div>
    </Effect>
  ),
}

export const BlurAndZoom: Story = {
  render: (args) => (
    <Effect {...args} blur zoom>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Blur + Zoom</h3>
        <p className="text-sm text-muted-foreground">Combines blur unblur with zoom scaling.</p>
      </div>
    </Effect>
  ),
}

export const AllEffects: Story = {
  render: (args) => (
    <Effect {...args} fade slide blur zoom>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">All Combined</h3>
        <p className="text-sm text-muted-foreground">Fade, slide, blur, and zoom together.</p>
      </div>
    </Effect>
  ),
}

export const CustomSlideDirection: Story = {
  render: (args) => (
    <Effect {...args} fade slide={{ direction: "right", offset: 200 }}>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Custom Slide</h3>
        <p className="text-sm text-muted-foreground">Slides from right with a 200px offset.</p>
      </div>
    </Effect>
  ),
}

export const StaggeredList: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Effects holdDelay={150} fade slide>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 1</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 2</div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">Item 3</div>
      </Effects>
    </div>
  ),
}
