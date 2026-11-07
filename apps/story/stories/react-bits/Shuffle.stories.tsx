import Shuffle from "@repo/ui/components/Shuffle"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/Shuffle",
  component: Shuffle,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "The text to display with shuffle animation",
    },
    shuffleDirection: {
      control: { type: "select" },
      options: ["left", "right", "up", "down"],
      description: "Direction of the shuffle/slot-machine animation",
    },
    duration: {
      control: { type: "range", min: 0.1, max: 2, step: 0.05 },
      description: "Animation duration in seconds",
    },
    stagger: {
      control: { type: "range", min: 0, max: 0.1, step: 0.005 },
      description: "Stagger delay between characters",
    },
    shuffleTimes: {
      control: { type: "range", min: 1, max: 5, step: 1 },
      description: "Number of shuffle rolls before settling",
    },
    animationMode: {
      control: { type: "select" },
      options: ["random", "evenodd"],
      description: "Animation mode for character groups",
    },
    tag: {
      control: { type: "select" },
      options: ["h1", "h2", "h3", "h4", "p", "span"],
      description: "HTML tag to render the text element",
    },
    loop: {
      control: { type: "boolean" },
      description: "Loop the shuffle animation continuously",
    },
    loopDelay: {
      control: { type: "range", min: 0, max: 5, step: 0.5 },
      description: "Delay in seconds between loops",
    },
    triggerOnHover: {
      control: { type: "boolean" },
      description: "Re-trigger shuffle on hover",
    },
    triggerOnce: {
      control: { type: "boolean" },
      description: "Only trigger the scroll animation once",
    },
    scrambleCharset: {
      control: { type: "text" },
      description: "Character set for scrambled intermediate frames",
    },
    colorFrom: {
      control: { type: "color" },
      description: "Starting color for color transition",
    },
    colorTo: {
      control: { type: "color" },
      description: "Ending color for color transition",
    },
    className: {
      control: { type: "text" },
      description: "Additional CSS classes",
    },
  },
  args: {
    text: "Shuffle",
    shuffleDirection: "right",
    duration: 0.35,
    stagger: 0.03,
    shuffleTimes: 1,
    animationMode: "evenodd",
    tag: "p",
    loop: false,
    loopDelay: 0,
    triggerOnHover: true,
    triggerOnce: true,
    className: "text-white",
  },
} satisfies Meta<typeof Shuffle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const VerticalShuffle: Story = {
  args: {
    text: "Vertical",
    shuffleDirection: "up",
    shuffleTimes: 3,
    duration: 0.5,
    className: "text-white",
  },
}

export const LoopingWithColor: Story = {
  args: {
    text: "Looping",
    loop: true,
    loopDelay: 2,
    shuffleTimes: 2,
    colorFrom: "#ff0055",
    colorTo: "#00ffaa",
    scrambleCharset: "!@#$%^&*",
    className: "text-white",
  },
}
