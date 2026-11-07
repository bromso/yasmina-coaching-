import ASCIIText from "@repo/ui/components/ASCIIText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/ASCIIText",
  component: ASCIIText,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "The text to render as ASCII art",
    },
    asciiFontSize: {
      control: { type: "range", min: 4, max: 20, step: 1 },
      description: "Font size of ASCII characters in the filter",
    },
    textFontSize: {
      control: { type: "range", min: 50, max: 400, step: 10 },
      description: "Font size of the source text rendered to canvas",
    },
    textColor: {
      control: { type: "color" },
      description: "Color of the source text",
    },
    planeBaseHeight: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      description: "Base height of the Three.js plane geometry",
    },
    enableWaves: {
      control: { type: "boolean" },
      description: "Enable wave distortion animation on the mesh",
    },
  },
  args: {
    text: "Hello!",
    asciiFontSize: 8,
    textFontSize: 200,
    textColor: "#fdf9f3",
    planeBaseHeight: 8,
    enableWaves: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#060010" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ASCIIText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LargeText: Story = {
  args: {
    text: "React",
    textFontSize: 300,
    asciiFontSize: 6,
  },
}

export const NoWaves: Story = {
  args: {
    text: "Static",
    enableWaves: false,
  },
}
