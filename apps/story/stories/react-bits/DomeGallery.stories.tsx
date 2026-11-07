import DomeGallery from "@repo/ui/components/DomeGallery"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/DomeGallery",
  component: DomeGallery,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    fit: {
      control: { type: "number", min: 0.2, max: 1.5, step: 0.1 },
      description: "How much of the container the dome fills",
    },
    fitBasis: {
      control: { type: "select" },
      options: ["auto", "min", "max", "width", "height"],
      description: "Which dimension to base the fit calculation on",
    },
    minRadius: {
      control: { type: "number", min: 200, max: 1000 },
      description: "Minimum radius of the dome in pixels",
    },
    dragSensitivity: {
      control: { type: "number", min: 5, max: 50 },
      description: "How sensitive the drag rotation is",
    },
    maxVerticalRotationDeg: {
      control: { type: "number", min: 0, max: 30 },
      description: "Maximum vertical rotation in degrees",
    },
    grayscale: {
      control: { type: "boolean" },
      description: "Apply grayscale filter to images",
    },
    imageBorderRadius: {
      control: { type: "text" },
      description: "Border radius of tile images",
    },
    overlayBlurColor: {
      control: { type: "color" },
      description: "Color of the edge fade overlay",
    },
  },
  args: {
    fit: 0.5,
    fitBasis: "auto",
    minRadius: 600,
    dragSensitivity: 20,
    maxVerticalRotationDeg: 5,
    grayscale: true,
    imageBorderRadius: "30px",
    overlayBlurColor: "#060010",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "900px", height: "600px", background: "#060010" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DomeGallery>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ColorfulImages: Story = {
  args: {
    grayscale: false,
    images: [
      { src: "https://picsum.photos/seed/d1/400/400", alt: "Photo 1" },
      { src: "https://picsum.photos/seed/d2/400/400", alt: "Photo 2" },
      { src: "https://picsum.photos/seed/d3/400/400", alt: "Photo 3" },
      { src: "https://picsum.photos/seed/d4/400/400", alt: "Photo 4" },
      { src: "https://picsum.photos/seed/d5/400/400", alt: "Photo 5" },
      { src: "https://picsum.photos/seed/d6/400/400", alt: "Photo 6" },
      { src: "https://picsum.photos/seed/d7/400/400", alt: "Photo 7" },
    ],
  },
}
