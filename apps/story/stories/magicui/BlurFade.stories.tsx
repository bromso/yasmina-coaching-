import { BlurFade } from "@repo/ui/components/magicui/blur-fade"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Effects/BlurFade",
  component: BlurFade,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    duration: {
      control: { type: "number", min: 0.1, max: 2, step: 0.1 },
      description: "Duration of the animation in seconds",
    },
    delay: {
      control: { type: "number", min: 0, max: 2, step: 0.1 },
      description: "Delay before animation starts",
    },
    offset: {
      control: { type: "number", min: 0, max: 50 },
      description: "Distance offset for the slide animation in pixels",
    },
    direction: {
      control: "select",
      options: ["up", "down", "left", "right"],
      description: "Direction of the slide-in animation",
    },
    blur: {
      control: "text",
      description: "CSS blur value for the initial state",
    },
    inView: {
      control: "boolean",
      description: "Whether to trigger animation only when in view",
    },
  },
  args: {
    duration: 0.4,
    delay: 0,
    offset: 6,
    direction: "down",
    blur: "6px",
    inView: false,
  },
} satisfies Meta<typeof BlurFade>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: undefined,
  },
  render: (args) => (
    <BlurFade {...args}>
      <h2 className="text-2xl font-bold">Hello, World</h2>
    </BlurFade>
  ),
}

export const SlideUp: Story = {
  args: {
    direction: "up",
    children: undefined,
  },
  render: (args) => (
    <BlurFade {...args}>
      <h2 className="text-2xl font-bold">Slide Up</h2>
    </BlurFade>
  ),
}

export const SlideLeft: Story = {
  args: {
    direction: "left",
    children: undefined,
  },
  render: (args) => (
    <BlurFade {...args}>
      <h2 className="text-2xl font-bold">Slide Left</h2>
    </BlurFade>
  ),
}

export const StaggeredList: Story = {
  args: {
    children: undefined,
  },
  render: () => (
    <div className="flex flex-col gap-4">
      {["First item", "Second item", "Third item", "Fourth item"].map((text, index) => (
        <BlurFade key={text} delay={index * 0.15}>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm font-medium">{text}</p>
          </div>
        </BlurFade>
      ))}
    </div>
  ),
}

export const HeavyBlur: Story = {
  args: {
    blur: "16px",
    offset: 20,
    duration: 0.8,
    children: undefined,
  },
  render: (args) => (
    <BlurFade {...args}>
      <h2 className="text-2xl font-bold">Heavy Blur</h2>
    </BlurFade>
  ),
}
