import BlobCursor from "@repo/ui/components/BlobCursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/BlobCursor",
  component: BlobCursor,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    blobType: { control: "select", options: ["circle", "square"] },
    fillColor: { control: "color" },
    trailCount: { control: { type: "number", min: 1, max: 10, step: 1 } },
    useFilter: { control: "boolean" },
    fastDuration: { control: { type: "number", min: 0.01, max: 1, step: 0.01 } },
    slowDuration: { control: { type: "number", min: 0.1, max: 2, step: 0.1 } },
    shadowBlur: { control: { type: "number", min: 0, max: 20, step: 1 } },
    innerColor: { control: "color" },
    shadowColor: { control: "color" },
    filterStdDeviation: { control: { type: "number", min: 5, max: 60, step: 5 } },
  },
  args: {
    blobType: "circle",
    fillColor: "#5227FF",
    trailCount: 3,
    useFilter: true,
    fastDuration: 0.1,
    slowDuration: 0.5,
    innerColor: "rgba(255,255,255,0.8)",
    shadowBlur: 5,
    filterStdDeviation: 30,
  },
} satisfies Meta<typeof BlobCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
      <BlobCursor {...args} />
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

export const SquareBlobs: Story = {
  args: {
    blobType: "square",
    fillColor: "#FF4500",
    useFilter: false,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
      <BlobCursor {...args} />
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
