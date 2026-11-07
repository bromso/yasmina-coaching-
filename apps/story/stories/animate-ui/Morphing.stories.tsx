import { MorphingText } from "@repo/ui/components/animate-ui/primitives/texts/morphing"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Morphing",
  component: MorphingText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
    loop: {
      control: "boolean",
    },
    holdDelay: {
      control: { type: "number", min: 500, max: 10000, step: 500 },
    },
  },
  args: {
    delay: 0,
    loop: false,
    holdDelay: 2500,
  },
} satisfies Meta<typeof MorphingText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    text: "Morphing Text",
    className: "text-3xl font-bold",
  },
}

export const RotatingWords: Story = {
  args: {
    text: ["React", "Next.js", "TypeScript", "Storybook"],
    className: "text-3xl font-bold",
    loop: true,
    holdDelay: 2000,
  },
}

export const LongPhrases: Story = {
  args: {
    text: ["Build Beautiful UIs", "Ship With Confidence", "Scale Your Design"],
    className: "text-2xl font-semibold",
    loop: true,
    holdDelay: 3000,
  },
}

export const WithDelay: Story = {
  args: {
    text: ["Hello", "World"],
    className: "text-4xl font-bold",
    loop: true,
    delay: 1000,
  },
}
