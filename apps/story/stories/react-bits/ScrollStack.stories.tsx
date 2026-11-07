import ScrollStack, { ScrollStackItem } from "@repo/ui/components/ScrollStack"
import type { Meta, StoryObj } from "@storybook/react-vite"

const cardColors = ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#2c3e50"]

const StackContent = () => (
  <>
    {cardColors.map((color, i) => (
      <ScrollStackItem key={color} itemClassName={`bg-[${color}]`}>
        <div
          style={{
            background: color,
            borderRadius: "40px",
            padding: "3rem",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            color: "white",
          }}
        >
          <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Card {i + 1}</h2>
          <p style={{ opacity: 0.7 }}>
            Scroll down to see cards stack on top of each other with a scale effect.
          </p>
        </div>
      </ScrollStackItem>
    ))}
  </>
)

const meta = {
  title: "React Bits/Components/ScrollStack",
  component: ScrollStack,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    itemDistance: {
      control: { type: "range", min: 20, max: 300, step: 10 },
      description: "Distance between items in px",
    },
    itemScale: {
      control: { type: "range", min: 0, max: 0.1, step: 0.005 },
      description: "Scale reduction per stacked card",
    },
    itemStackDistance: {
      control: { type: "range", min: 10, max: 80, step: 5 },
      description: "Vertical offset when stacked",
    },
    baseScale: {
      control: { type: "range", min: 0.6, max: 1, step: 0.05 },
      description: "Base scale for the bottom-most card",
    },
    rotationAmount: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Rotation amount per card in degrees",
    },
    blurAmount: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Blur amount for cards deeper in the stack",
    },
  },
  args: {
    itemDistance: 100,
    itemScale: 0.03,
    itemStackDistance: 30,
    baseScale: 0.85,
    rotationAmount: 0,
    blurAmount: 0,
    children: <StackContent />,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollStack>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithBlurAndRotation: Story = {
  args: {
    rotationAmount: 2,
    blurAmount: 3,
  },
}
