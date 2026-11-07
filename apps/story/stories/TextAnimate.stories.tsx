import { TextAnimate } from "@repo/ui/components/text-animate"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/TextAnimate",
  component: TextAnimate,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    animation: {
      control: { type: "select" },
      options: [
        "fadeIn",
        "blurIn",
        "blurInUp",
        "blurInDown",
        "slideUp",
        "slideDown",
        "slideLeft",
        "slideRight",
        "scaleUp",
        "scaleDown",
      ],
    },
    by: {
      control: { type: "select" },
      options: ["text", "word", "character", "line"],
    },
    delay: {
      control: { type: "number", min: 0, max: 3, step: 0.1 },
    },
    duration: {
      control: { type: "number", min: 0.1, max: 3, step: 0.1 },
    },
    startOnView: {
      control: { type: "boolean" },
    },
    once: {
      control: { type: "boolean" },
    },
  },
  args: {
    children: "Animate this text beautifully",
    animation: "fadeIn",
    by: "word",
    delay: 0,
    duration: 0.3,
    startOnView: false,
    once: false,
  },
} satisfies Meta<typeof TextAnimate>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "text-3xl font-bold",
  },
}

export const BlurIn: Story = {
  args: {
    children: "Blurring into focus",
    animation: "blurIn",
    className: "text-3xl font-bold",
  },
}

export const BlurInUp: Story = {
  args: {
    children: "Rising from below with blur",
    animation: "blurInUp",
    className: "text-3xl font-bold",
  },
}

export const SlideUp: Story = {
  args: {
    children: "Sliding up word by word",
    animation: "slideUp",
    by: "word",
    className: "text-3xl font-bold",
  },
}

export const SlideLeft: Story = {
  args: {
    children: "Sliding in from the right",
    animation: "slideLeft",
    by: "word",
    className: "text-3xl font-bold",
  },
}

export const ScaleUp: Story = {
  args: {
    children: "Scaling up with spring",
    animation: "scaleUp",
    by: "word",
    className: "text-3xl font-bold",
  },
}

export const ByCharacter: Story = {
  args: {
    children: "Character by character",
    animation: "fadeIn",
    by: "character",
    className: "text-3xl font-bold",
  },
}

export const ByLine: Story = {
  args: {
    children: "First line appears\nThen the second line\nFinally the third",
    animation: "blurInUp",
    by: "line",
    className: "text-2xl font-bold",
  },
}

export const WholeText: Story = {
  args: {
    children: "This animates as one block",
    animation: "fadeIn",
    by: "text",
    className: "text-3xl font-bold",
  },
}

export const WithDelay: Story = {
  args: {
    children: "Delayed animation start",
    animation: "slideUp",
    delay: 1,
    className: "text-3xl font-bold",
  },
}
