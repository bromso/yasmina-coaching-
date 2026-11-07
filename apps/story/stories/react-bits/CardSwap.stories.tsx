import CardSwap, { Card } from "@repo/ui/components/CardSwap"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/CardSwap",
  component: CardSwap,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 200, max: 800 },
      description: "Width of each card",
    },
    height: {
      control: { type: "number", min: 200, max: 600 },
      description: "Height of each card",
    },
    cardDistance: {
      control: { type: "number", min: 20, max: 120 },
      description: "Horizontal distance between stacked cards",
    },
    verticalDistance: {
      control: { type: "number", min: 20, max: 120 },
      description: "Vertical offset between stacked cards",
    },
    delay: {
      control: { type: "number", min: 1000, max: 10000, step: 500 },
      description: "Delay between card swaps in milliseconds",
    },
    pauseOnHover: {
      control: { type: "boolean" },
      description: "Pause the swap animation on hover",
    },
    skewAmount: {
      control: { type: "number", min: 0, max: 20 },
      description: "Skew angle applied to cards",
    },
    easing: {
      control: { type: "select" },
      options: ["elastic", "linear"],
      description: "Easing function for the swap animation",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    width: 300,
    height: 200,
    cardDistance: 60,
    verticalDistance: 70,
    delay: 5000,
    pauseOnHover: false,
    skewAmount: 6,
    easing: "elastic",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "600px", height: "500px", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardSwap>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <CardSwap {...args}>
      <Card
        style={{
          backgroundImage: "url(https://picsum.photos/seed/10/300/200)",
          backgroundSize: "cover",
        }}
      />
      <Card
        style={{
          backgroundImage: "url(https://picsum.photos/seed/11/300/200)",
          backgroundSize: "cover",
        }}
      />
      <Card
        style={{
          backgroundImage: "url(https://picsum.photos/seed/12/300/200)",
          backgroundSize: "cover",
        }}
      />
      <Card
        style={{
          backgroundImage: "url(https://picsum.photos/seed/13/300/200)",
          backgroundSize: "cover",
        }}
      />
    </CardSwap>
  ),
}

export const PauseOnHover: Story = {
  args: {
    pauseOnHover: true,
    easing: "linear",
    delay: 3000,
  },
  render: (args) => (
    <CardSwap {...args}>
      <Card
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "1.5rem",
          fontWeight: "bold",
        }}
      >
        Card 1
      </Card>
      <Card
        style={{
          background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "1.5rem",
          fontWeight: "bold",
        }}
      >
        Card 2
      </Card>
      <Card
        style={{
          background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "1.5rem",
          fontWeight: "bold",
        }}
      >
        Card 3
      </Card>
    </CardSwap>
  ),
}
