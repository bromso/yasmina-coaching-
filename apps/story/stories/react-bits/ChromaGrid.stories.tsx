import ChromaGrid from "@repo/ui/components/ChromaGrid"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/ChromaGrid",
  component: ChromaGrid,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    radius: {
      control: { type: "number", min: 100, max: 600 },
      description: "Radius of the spotlight reveal effect in pixels",
    },
    damping: {
      control: { type: "number", min: 0.1, max: 1, step: 0.05 },
      description: "Smoothing factor for the cursor-follow animation",
    },
    fadeOut: {
      control: { type: "number", min: 0.1, max: 2, step: 0.1 },
      description: "Duration of the fade-out when mouse leaves",
    },
    ease: {
      control: { type: "text" },
      description: "GSAP easing function",
    },
  },
  args: {
    radius: 300,
    damping: 0.45,
    fadeOut: 0.6,
    ease: "power3.out",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "960px", height: "600px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChromaGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomItems: Story = {
  args: {
    radius: 400,
    items: [
      {
        image: "https://picsum.photos/seed/a1/300/300",
        title: "Luna Perez",
        subtitle: "Product Designer",
        handle: "@lunaperez",
        borderColor: "#FF6B6B",
        gradient: "linear-gradient(145deg, #FF6B6B, #000)",
      },
      {
        image: "https://picsum.photos/seed/a2/300/300",
        title: "Kai Nakamura",
        subtitle: "Frontend Engineer",
        handle: "@kainakamura",
        borderColor: "#4ECDC4",
        gradient: "linear-gradient(210deg, #4ECDC4, #000)",
      },
      {
        image: "https://picsum.photos/seed/a3/300/300",
        title: "Ava Johansson",
        subtitle: "Creative Director",
        handle: "@avajohansson",
        borderColor: "#FFE66D",
        gradient: "linear-gradient(165deg, #FFE66D, #000)",
      },
    ],
  },
}
