import StickerPeel from "@repo/ui/components/StickerPeel"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/StickerPeel",
  component: StickerPeel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    imageSrc: {
      control: { type: "text" },
      description: "URL of the sticker image",
    },
    rotate: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Rotation angle of the sticker image",
    },
    peelBackHoverPct: {
      control: { type: "range", min: 5, max: 60, step: 5 },
      description: "Percentage of peel-back on hover",
    },
    peelBackActivePct: {
      control: { type: "range", min: 10, max: 80, step: 5 },
      description: "Percentage of peel-back on click/active",
    },
    width: {
      control: { type: "range", min: 80, max: 400, step: 10 },
      description: "Width of the sticker in pixels",
    },
    shadowIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Intensity of the drop shadow effect",
    },
    lightingIntensity: {
      control: { type: "range", min: 0, max: 0.5, step: 0.05 },
      description: "Intensity of the specular lighting effect",
    },
    peelDirection: {
      control: { type: "range", min: 0, max: 360, step: 15 },
      description: "Direction of the peel effect in degrees",
    },
  },
  args: {
    imageSrc: "https://picsum.photos/seed/sticker/200/200",
    rotate: 30,
    peelBackHoverPct: 30,
    peelBackActivePct: 40,
    width: 200,
    shadowIntensity: 0.6,
    lightingIntensity: 0.1,
    peelDirection: 0,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 500,
          height: 400,
          position: "relative",
          background: "#f0f0f0",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StickerPeel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LargeSticker: Story = {
  args: {
    imageSrc: "https://picsum.photos/seed/sticker2/300/300",
    width: 300,
    rotate: -15,
    peelBackHoverPct: 40,
    peelBackActivePct: 55,
    shadowIntensity: 0.8,
  },
}
