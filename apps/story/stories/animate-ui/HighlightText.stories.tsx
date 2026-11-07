import { HighlightText } from "@repo/ui/components/animate-ui/primitives/texts/highlight"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/HighlightText",
  component: HighlightText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: "text",
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    text: "Highlighted Text",
    delay: 0,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof HighlightText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    text: "This text gets highlighted",
    className: "text-2xl font-semibold",
    style: {
      backgroundImage:
        "linear-gradient(to right, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.3))",
    },
  },
}

export const YellowHighlight: Story = {
  args: {
    text: "Yellow marker effect",
    className: "text-2xl font-semibold",
    style: {
      backgroundImage: "linear-gradient(to right, #fef08a, #fef08a)",
    },
  },
}

export const WithDelay: Story = {
  args: {
    text: "Delayed highlight animation",
    className: "text-xl font-medium",
    delay: 1000,
    style: {
      backgroundImage:
        "linear-gradient(to right, hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.2))",
    },
  },
}

export const InParagraph: Story = {
  render: (args) => (
    <p className="text-lg max-w-md text-center leading-relaxed">
      Build your next project with{" "}
      <HighlightText
        {...args}
        text="animated components"
        style={{
          backgroundImage: "linear-gradient(to right, #c4b5fd, #c4b5fd)",
        }}
        className="font-semibold"
      />{" "}
      that bring your UI to life.
    </p>
  ),
}
