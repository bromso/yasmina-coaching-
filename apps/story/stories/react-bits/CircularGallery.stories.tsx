import CircularGallery from "@repo/ui/components/CircularGallery"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/CircularGallery",
  component: CircularGallery,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    bend: {
      control: { type: "number", min: -5, max: 5, step: 0.5 },
      description: "Curvature of the gallery arc (positive = downward, negative = upward)",
    },
    textColor: {
      control: { type: "color" },
      description: "Color of the text labels below images",
    },
    borderRadius: {
      control: { type: "number", min: 0, max: 0.2, step: 0.01 },
      description: "Border radius of image planes (0 to 0.2)",
    },
    scrollSpeed: {
      control: { type: "number", min: 0.5, max: 10, step: 0.5 },
      description: "Speed of scroll/drag interaction",
    },
    scrollEase: {
      control: { type: "number", min: 0.01, max: 0.2, step: 0.01 },
      description: "Easing factor for scroll smoothing",
    },
  },
  args: {
    bend: 3,
    textColor: "#ffffff",
    borderRadius: 0.05,
    scrollSpeed: 2,
    scrollEase: 0.05,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "100vh", background: "#060010" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CircularGallery>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomImages: Story = {
  args: {
    bend: 1,
    borderRadius: 0.1,
    items: [
      { image: "https://picsum.photos/seed/g1/800/600", text: "Mountains" },
      { image: "https://picsum.photos/seed/g2/800/600", text: "Ocean" },
      { image: "https://picsum.photos/seed/g3/800/600", text: "Forest" },
      { image: "https://picsum.photos/seed/g4/800/600", text: "Desert" },
      { image: "https://picsum.photos/seed/g5/800/600", text: "City" },
      { image: "https://picsum.photos/seed/g6/800/600", text: "Valley" },
    ],
  },
}
