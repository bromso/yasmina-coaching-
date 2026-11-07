import ReflectiveCard from "@repo/ui/components/ReflectiveCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/ReflectiveCard",
  component: ReflectiveCard,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  tags: ["autodocs"],
  argTypes: {
    blurStrength: {
      control: { type: "range", min: 0, max: 30, step: 1 },
      description: "Strength of the background blur on the webcam feed",
    },
    color: {
      control: "color",
      description: "Text color",
    },
    metalness: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Metalness of the reflective overlay",
    },
    roughness: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Roughness (noise overlay opacity)",
    },
    overlayColor: {
      control: "text",
      description: "RGBA overlay color on the content area",
    },
    displacementStrength: {
      control: { type: "range", min: 0, max: 50, step: 1 },
      description: "Strength of SVG displacement filter",
    },
    noiseScale: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Scale of the noise turbulence",
    },
    specularConstant: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Specular constant for light reflections",
    },
    grayscale: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Grayscale amount (1 = fully grayscale)",
    },
    glassDistortion: {
      control: { type: "range", min: 0, max: 50, step: 1 },
      description: "Glass-like distortion strength",
    },
  },
  args: {
    blurStrength: 12,
    color: "white",
    metalness: 1,
    roughness: 0.4,
    overlayColor: "rgba(255, 255, 255, 0.1)",
    displacementStrength: 20,
    noiseScale: 1,
    specularConstant: 1.2,
    grayscale: 1,
    glassDistortion: 0,
  },
} satisfies Meta<typeof ReflectiveCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HighDistortion: Story = {
  args: {
    displacementStrength: 40,
    glassDistortion: 25,
    blurStrength: 20,
  },
}
