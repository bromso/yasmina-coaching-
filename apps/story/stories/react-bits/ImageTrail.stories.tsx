import ImageTrail from "@repo/ui/components/ImageTrail"
import type { Meta, StoryObj } from "@storybook/react-vite"

const placeholderImages = Array.from(
  { length: 12 },
  (_, i) => `https://picsum.photos/seed/${i + 1}/300/400`
)

const meta = {
  title: "React Bits/Animations/ImageTrail",
  component: ImageTrail,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "number", min: 1, max: 8, step: 1 },
      description: "Trail animation variant (1-8)",
    },
    items: { control: "object" },
  },
  args: {
    items: placeholderImages,
    variant: 1,
  },
} satisfies Meta<typeof ImageTrail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <ImageTrail {...args} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "rgba(255,255,255,0.3)",
          fontSize: "1.25rem",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}

export const Variant3: Story = {
  args: {
    variant: 3,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <ImageTrail {...args} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "rgba(255,255,255,0.3)",
          fontSize: "1.25rem",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}
