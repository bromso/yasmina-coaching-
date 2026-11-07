import DecayCard from "@repo/ui/components/DecayCard"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/DecayCard",
  component: DecayCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 150, max: 600 },
      description: "Width of the card in pixels",
    },
    height: {
      control: { type: "number", min: 200, max: 800 },
      description: "Height of the card in pixels",
    },
    image: {
      control: { type: "text" },
      description: "URL of the card image",
    },
  },
  args: {
    width: 300,
    height: 400,
    image: "https://picsum.photos/seed/decay/300/400?grayscale",
  },
} satisfies Meta<typeof DecayCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <DecayCard {...args}>
      <span style={{ color: "white" }}>
        Decay
        <br />
        Card
      </span>
    </DecayCard>
  ),
}

export const ColorImage: Story = {
  args: {
    width: 350,
    height: 450,
    image: "https://picsum.photos/seed/decay2/350/450",
  },
  render: (args) => (
    <DecayCard {...args}>
      <span style={{ color: "white" }}>
        Vibrant
        <br />
        Colors
      </span>
    </DecayCard>
  ),
}
