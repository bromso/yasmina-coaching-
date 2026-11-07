import PixelCard from "@repo/ui/components/PixelCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/PixelCard",
  component: PixelCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "blue", "yellow", "pink"],
      description: "Color variant preset",
    },
    gap: {
      control: { type: "range", min: 2, max: 20, step: 1 },
      description: "Gap between pixels",
    },
    speed: {
      control: { type: "range", min: 5, max: 100, step: 5 },
      description: "Animation speed of the pixel shimmer",
    },
    colors: {
      control: "text",
      description: "Comma-separated color values for pixels",
    },
    noFocus: {
      control: "boolean",
      description: "Disable focus/blur interaction",
    },
  },
  args: {
    variant: "default",
    children: (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          zIndex: 1,
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h3 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>Pixel Card</h3>
        <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>Hover to see the pixel effect</p>
      </div>
    ),
  },
} satisfies Meta<typeof PixelCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const BlueVariant: Story = {
  args: {
    variant: "blue",
  },
}
