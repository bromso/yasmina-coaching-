import { Highlighter } from "@repo/ui/components/highlighter"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/Highlighter",
  component: Highlighter,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    action: {
      control: "select",
      options: [
        "highlight",
        "underline",
        "box",
        "circle",
        "strike-through",
        "crossed-off",
        "bracket",
      ],
      description: "The annotation style to apply",
    },
    color: {
      control: "color",
      description: "The color of the annotation",
    },
    strokeWidth: {
      control: { type: "number", min: 0.5, max: 5, step: 0.5 },
      description: "Width of the annotation stroke",
    },
    animationDuration: {
      control: { type: "number", min: 100, max: 3000, step: 100 },
      description: "Duration of the annotation animation in ms",
    },
    iterations: {
      control: { type: "number", min: 1, max: 5 },
      description: "Number of iterations for the annotation drawing",
    },
    padding: {
      control: { type: "number", min: 0, max: 20 },
    },
    multiline: {
      control: "boolean",
      description: "Whether the annotation supports multiline text",
    },
    isView: {
      control: "boolean",
      description: "Whether to trigger animation when element enters viewport",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
  },
} satisfies Meta<typeof Highlighter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <p className="text-lg">
      This is a sentence with a <Highlighter {...args}>highlighted word</Highlighter> in it.
    </p>
  ),
  args: {
    action: "highlight",
    color: "#ffd1dc",
  },
}

export const Underline: Story = {
  render: (args) => (
    <p className="text-lg">
      This text has an <Highlighter {...args}>underlined section</Highlighter> for emphasis.
    </p>
  ),
  args: {
    action: "underline",
    color: "#4f9cf7",
    strokeWidth: 2,
  },
}

export const Box: Story = {
  render: (args) => (
    <p className="text-lg">
      Draw a <Highlighter {...args}>box around</Highlighter> important content.
    </p>
  ),
  args: {
    action: "box",
    color: "#22c55e",
    strokeWidth: 2,
  },
}

export const Circle: Story = {
  render: (args) => (
    <p className="text-lg">
      <Highlighter {...args}>Circle</Highlighter> this word for attention.
    </p>
  ),
  args: {
    action: "circle",
    color: "#ef4444",
    strokeWidth: 2,
    padding: 8,
  },
}

export const StrikeThrough: Story = {
  render: (args) => (
    <p className="text-lg">
      This price is <Highlighter {...args}>$99.99</Highlighter> now $49.99
    </p>
  ),
  args: {
    action: "strike-through",
    color: "#ef4444",
    strokeWidth: 2,
  },
}

export const Bracket: Story = {
  render: (args) => (
    <p className="text-lg">
      <Highlighter {...args}>Bracketed annotation style</Highlighter>
    </p>
  ),
  args: {
    action: "bracket",
    color: "#a78bfa",
    strokeWidth: 2,
  },
}

export const AllActions: Story = {
  render: () => (
    <div className="flex flex-col gap-6 text-lg">
      <p>
        <Highlighter action="highlight" color="#ffd1dc">
          Highlight
        </Highlighter>
      </p>
      <p>
        <Highlighter action="underline" color="#4f9cf7" strokeWidth={2}>
          Underline
        </Highlighter>
      </p>
      <p>
        <Highlighter action="box" color="#22c55e" strokeWidth={2}>
          Box
        </Highlighter>
      </p>
      <p>
        <Highlighter action="circle" color="#ef4444" strokeWidth={2} padding={8}>
          Circle
        </Highlighter>
      </p>
      <p>
        <Highlighter action="strike-through" color="#f97316" strokeWidth={2}>
          Strike-through
        </Highlighter>
      </p>
      <p>
        <Highlighter action="crossed-off" color="#64748b" strokeWidth={2}>
          Crossed-off
        </Highlighter>
      </p>
      <p>
        <Highlighter action="bracket" color="#a78bfa" strokeWidth={2}>
          Bracket
        </Highlighter>
      </p>
    </div>
  ),
}
