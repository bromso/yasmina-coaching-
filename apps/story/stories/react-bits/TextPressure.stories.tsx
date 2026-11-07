import TextPressure from "@repo/ui/components/TextPressure"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/TextPressure",
  component: TextPressure,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "Text to display with variable font pressure effect",
    },
    fontFamily: {
      control: { type: "text" },
      description: "Variable font family name",
    },
    fontUrl: {
      control: { type: "text" },
      description: "URL to the variable font file",
    },
    width: {
      control: { type: "boolean" },
      description: "Vary the wdth axis based on cursor proximity",
    },
    weight: {
      control: { type: "boolean" },
      description: "Vary the wght axis based on cursor proximity",
    },
    italic: {
      control: { type: "boolean" },
      description: "Vary the ital axis based on cursor proximity",
    },
    alpha: {
      control: { type: "boolean" },
      description: "Vary opacity based on cursor proximity",
    },
    flex: {
      control: { type: "boolean" },
      description: "Use flexbox with justify-between for letter spacing",
    },
    stroke: {
      control: { type: "boolean" },
      description: "Add a stroke outline to the text",
    },
    scale: {
      control: { type: "boolean" },
      description: "Scale text vertically to fill the container",
    },
    textColor: {
      control: { type: "color" },
      description: "Color of the text",
    },
    strokeColor: {
      control: { type: "color" },
      description: "Color of the text stroke",
    },
    strokeWidth: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Width of the text stroke in pixels",
    },
    minFontSize: {
      control: { type: "range", min: 12, max: 100, step: 4 },
      description: "Minimum font size in pixels",
    },
  },
  args: {
    text: "Compressa",
    fontFamily: "Compressa VF",
    fontUrl: "https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2",
    width: true,
    weight: true,
    italic: true,
    alpha: false,
    flex: true,
    stroke: false,
    scale: false,
    textColor: "#FFFFFF",
    strokeColor: "#FF0000",
    strokeWidth: 2,
    minFontSize: 24,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextPressure>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithStroke: Story = {
  args: {
    text: "Stroke",
    stroke: true,
    strokeColor: "#ff3366",
    strokeWidth: 3,
    textColor: "#ffffff",
  },
}

export const AlphaEffect: Story = {
  args: {
    text: "Alpha",
    alpha: true,
    width: false,
    italic: false,
    textColor: "#00ffaa",
  },
}
