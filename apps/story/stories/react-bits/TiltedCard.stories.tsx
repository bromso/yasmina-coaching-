import TiltedCard from "@repo/ui/components/TiltedCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/TiltedCard",
  component: TiltedCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    imageSrc: {
      control: "text",
      description: "Image source URL",
    },
    altText: {
      control: "text",
      description: "Alt text for the image",
    },
    captionText: {
      control: "text",
      description: "Tooltip caption that follows the cursor",
    },
    containerHeight: {
      control: "text",
      description: "Height of the container",
    },
    containerWidth: {
      control: "text",
      description: "Width of the container",
    },
    imageHeight: {
      control: "text",
      description: "Height of the image",
    },
    imageWidth: {
      control: "text",
      description: "Width of the image",
    },
    scaleOnHover: {
      control: { type: "range", min: 1, max: 1.5, step: 0.05 },
      description: "Scale factor when hovered",
    },
    rotateAmplitude: {
      control: { type: "range", min: 0, max: 30, step: 1 },
      description: "Maximum rotation angle in degrees",
    },
    showMobileWarning: {
      control: "boolean",
      description: "Show mobile compatibility warning",
    },
    showTooltip: {
      control: "boolean",
      description: "Show the cursor-following tooltip",
    },
    displayOverlayContent: {
      control: "boolean",
      description: "Display overlay content on the card",
    },
  },
  args: {
    imageSrc: "https://picsum.photos/seed/tilted/400/400",
    altText: "Tilted card demo image",
    captionText: "Hover me!",
    containerHeight: "400px",
    containerWidth: "400px",
    imageHeight: "300px",
    imageWidth: "300px",
    scaleOnHover: 1.1,
    rotateAmplitude: 14,
    showMobileWarning: true,
    showTooltip: true,
    displayOverlayContent: false,
  },
} satisfies Meta<typeof TiltedCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HighRotation: Story = {
  args: {
    rotateAmplitude: 25,
    scaleOnHover: 1.2,
    captionText: "Wild tilt!",
    imageSrc: "https://picsum.photos/seed/tilt2/400/400",
  },
}
