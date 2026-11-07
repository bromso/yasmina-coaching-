import VariableProximity from "@repo/ui/components/VariableProximity"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ComponentProps, useRef } from "react"

const meta = {
  title: "React Bits/TextAnimations/VariableProximity",
  component: VariableProximity,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    label: {
      control: { type: "text" },
      description: "Text to display with variable font proximity effect",
    },
    fromFontVariationSettings: {
      control: { type: "text" },
      description: "Font variation settings when the cursor is far away",
    },
    toFontVariationSettings: {
      control: { type: "text" },
      description: "Font variation settings when the cursor is near",
    },
    radius: {
      control: { type: "range", min: 20, max: 300, step: 10 },
      description: "Radius of influence in pixels around the cursor",
    },
    falloff: {
      control: { type: "select" },
      options: ["linear", "exponential", "gaussian"],
      description: "Falloff curve for the proximity effect",
    },
    className: {
      control: { type: "text" },
      description: "Additional CSS classes",
    },
  },
  args: {
    label: "Variable Proximity",
    fromFontVariationSettings: "'wght' 400, 'opsz' 9",
    toFontVariationSettings: "'wght' 1000, 'opsz' 40",
    radius: 100,
    falloff: "linear",
    className: "text-5xl text-white",
  },
} satisfies Meta<typeof VariableProximity>

export default meta
// Every story renders through the wrapper, which supplies `containerRef` itself, so stories
// take every other prop as args.
type VariableProximityArgs = Omit<ComponentProps<typeof VariableProximity>, "containerRef">
type Story = StoryObj<VariableProximityArgs>

const VariableProximityWrapper = (args: VariableProximityArgs) => {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={containerRef}
      style={{
        width: "600px",
        height: "300px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <VariableProximity {...args} containerRef={containerRef} />
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap"
        rel="stylesheet"
      />
    </div>
  )
}

export const Default: Story = {
  render: (args) => <VariableProximityWrapper {...args} />,
}

export const GaussianFalloff: Story = {
  args: {
    label: "Gaussian Falloff",
    radius: 150,
    falloff: "gaussian",
    className: "text-5xl text-white",
  },
  render: (args) => <VariableProximityWrapper {...args} />,
}

export const LargeRadius: Story = {
  args: {
    label: "Large Radius",
    radius: 250,
    falloff: "exponential",
    fromFontVariationSettings: "'wght' 100, 'opsz' 8",
    toFontVariationSettings: "'wght' 900, 'opsz' 144",
    className: "text-6xl text-white",
  },
  render: (args) => <VariableProximityWrapper {...args} />,
}
