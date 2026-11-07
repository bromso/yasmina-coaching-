import Masonry from "@repo/ui/components/Masonry"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleItems = [
  { id: "1", img: "https://picsum.photos/seed/m1/400/500", url: "#", height: 500 },
  { id: "2", img: "https://picsum.photos/seed/m2/400/300", url: "#", height: 300 },
  { id: "3", img: "https://picsum.photos/seed/m3/400/600", url: "#", height: 600 },
  { id: "4", img: "https://picsum.photos/seed/m4/400/350", url: "#", height: 350 },
  { id: "5", img: "https://picsum.photos/seed/m5/400/450", url: "#", height: 450 },
  { id: "6", img: "https://picsum.photos/seed/m6/400/280", url: "#", height: 280 },
  { id: "7", img: "https://picsum.photos/seed/m7/400/520", url: "#", height: 520 },
  { id: "8", img: "https://picsum.photos/seed/m8/400/380", url: "#", height: 380 },
  { id: "9", img: "https://picsum.photos/seed/m9/400/460", url: "#", height: 460 },
  { id: "10", img: "https://picsum.photos/seed/m10/400/340", url: "#", height: 340 },
  { id: "11", img: "https://picsum.photos/seed/m11/400/550", url: "#", height: 550 },
  { id: "12", img: "https://picsum.photos/seed/m12/400/420", url: "#", height: 420 },
]

const meta = {
  title: "React Bits/Components/Masonry",
  component: Masonry,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    ease: {
      control: "text",
      description: "GSAP easing function for layout animations",
    },
    duration: {
      control: { type: "range", min: 0.2, max: 2, step: 0.1 },
      description: "Animation duration in seconds",
    },
    stagger: {
      control: { type: "range", min: 0, max: 0.2, step: 0.01 },
      description: "Stagger delay between items",
    },
    animateFrom: {
      control: "select",
      options: ["bottom", "top", "left", "right", "center", "random"],
      description: "Direction items animate from on initial load",
    },
    scaleOnHover: {
      control: "boolean",
      description: "Scale items down on hover",
    },
    hoverScale: {
      control: { type: "range", min: 0.8, max: 1, step: 0.01 },
      description: "Scale value when hovered",
    },
    blurToFocus: {
      control: "boolean",
      description: "Blur-to-focus entrance animation",
    },
    colorShiftOnHover: {
      control: "boolean",
      description: "Show a color overlay on hover",
    },
  },
  args: {
    items: sampleItems,
    ease: "power3.out",
    duration: 0.6,
    stagger: 0.05,
    animateFrom: "bottom",
    scaleOnHover: true,
    hoverScale: 0.95,
    blurToFocus: true,
    colorShiftOnHover: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Masonry>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ColorShift: Story = {
  args: {
    colorShiftOnHover: true,
    animateFrom: "random",
  },
}
