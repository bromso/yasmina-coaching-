import FuzzyText from "@repo/ui/components/FuzzyText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/FuzzyText",
  component: FuzzyText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
      description: "Text content to render with fuzzy effect",
    },
    fontSize: {
      control: { type: "text" },
      description: "CSS font-size value (number in px or CSS string)",
    },
    fontWeight: {
      control: { type: "range", min: 100, max: 900, step: 100 },
      description: "Font weight of the text",
    },
    color: {
      control: { type: "color" },
      description: "Text color",
    },
    enableHover: {
      control: { type: "boolean" },
      description: "Increase fuzz intensity on hover",
    },
    baseIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Baseline fuzz intensity",
    },
    hoverIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Fuzz intensity when hovered",
    },
    fuzzRange: {
      control: { type: "range", min: 5, max: 60, step: 1 },
      description: "Maximum pixel displacement range for the fuzz effect",
    },
    direction: {
      control: { type: "select" },
      options: ["horizontal", "vertical", "both"],
      description: "Direction of the fuzz displacement",
    },
    clickEffect: {
      control: { type: "boolean" },
      description: "Burst of fuzz on click",
    },
    glitchMode: {
      control: { type: "boolean" },
      description: "Periodic automatic glitch bursts",
    },
    glitchInterval: {
      control: { type: "range", min: 500, max: 5000, step: 100 },
      description: "Interval in ms between glitch bursts",
    },
    glitchDuration: {
      control: { type: "range", min: 50, max: 1000, step: 50 },
      description: "Duration in ms of each glitch burst",
    },
    letterSpacing: {
      control: { type: "range", min: -5, max: 20, step: 1 },
      description: "Letter spacing in pixels",
    },
  },
  args: {
    children: "Fuzzy",
    fontSize: "clamp(2rem, 8vw, 8rem)",
    fontWeight: 900,
    color: "#fff",
    enableHover: true,
    baseIntensity: 0.18,
    hoverIntensity: 0.5,
    fuzzRange: 30,
    direction: "horizontal",
    clickEffect: false,
    glitchMode: false,
    glitchInterval: 2000,
    glitchDuration: 200,
    letterSpacing: 0,
  },
} satisfies Meta<typeof FuzzyText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const GlitchMode: Story = {
  args: {
    children: "Glitch",
    glitchMode: true,
    glitchInterval: 1500,
    glitchDuration: 300,
    color: "#ff3333",
    baseIntensity: 0.1,
  },
}

export const VerticalFuzz: Story = {
  args: {
    children: "Vertical",
    direction: "both",
    baseIntensity: 0.25,
    hoverIntensity: 0.7,
    clickEffect: true,
    color: "#00ff88",
  },
}
