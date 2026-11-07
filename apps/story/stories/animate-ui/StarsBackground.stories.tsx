import { StarsBackground } from "@repo/ui/components/animate-ui/components/backgrounds/stars"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/StarsBackground",
  component: StarsBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    factor: {
      control: { type: "number", min: 0, max: 0.2, step: 0.01 },
      description: "Mouse parallax intensity factor",
    },
    speed: {
      control: { type: "number", min: 10, max: 200, step: 10 },
      description: "Base animation speed in seconds",
    },
    starColor: {
      control: "color",
      description: "Color of the stars",
    },
    pointerEvents: {
      control: "boolean",
      description: "Enable pointer events on the star layers",
    },
  },
} satisfies Meta<typeof StarsBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <StarsBackground className="h-[500px]" {...args}>
      <div className="relative z-10 flex items-center justify-center size-full">
        <h1 className="text-4xl font-bold text-white">Starry Night</h1>
      </div>
    </StarsBackground>
  ),
}

export const FastSpeed: Story = {
  render: () => (
    <StarsBackground className="h-[500px]" speed={15}>
      <div className="relative z-10 flex items-center justify-center size-full">
        <h1 className="text-4xl font-bold text-white">Warp Speed</h1>
      </div>
    </StarsBackground>
  ),
}

export const SlowSpeed: Story = {
  render: () => (
    <StarsBackground className="h-[500px]" speed={150}>
      <div className="relative z-10 flex items-center justify-center size-full">
        <h1 className="text-4xl font-bold text-white">Gentle Drift</h1>
      </div>
    </StarsBackground>
  ),
}

export const HighParallax: Story = {
  render: () => (
    <StarsBackground className="h-[500px]" factor={0.15}>
      <div className="relative z-10 flex items-center justify-center size-full">
        <h1 className="text-4xl font-bold text-white">Move your mouse</h1>
      </div>
    </StarsBackground>
  ),
}

export const GoldStars: Story = {
  render: () => (
    <StarsBackground className="h-[500px]" starColor="#fbbf24">
      <div className="relative z-10 flex items-center justify-center size-full">
        <h1 className="text-4xl font-bold text-yellow-400">Golden Stars</h1>
      </div>
    </StarsBackground>
  ),
}

export const WithContent: Story = {
  render: () => (
    <StarsBackground className="h-[500px]">
      <div className="relative z-10 flex flex-col items-center justify-center size-full gap-4">
        <h1 className="text-5xl font-bold text-white">Explore the Universe</h1>
        <p className="text-lg text-white/70 max-w-md text-center">
          A parallax star field background with three layers of depth.
        </p>
      </div>
    </StarsBackground>
  ),
}
