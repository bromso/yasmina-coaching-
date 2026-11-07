import { GravityStarsBackground } from "@repo/ui/components/animate-ui/components/backgrounds/gravity-stars"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/GravityStarsBackground",
  component: GravityStarsBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    starsCount: {
      control: { type: "number", min: 10, max: 300, step: 10 },
    },
    starsSize: {
      control: { type: "number", min: 1, max: 8, step: 0.5 },
    },
    starsOpacity: {
      control: { type: "number", min: 0.1, max: 1, step: 0.05 },
    },
    glowIntensity: {
      control: { type: "number", min: 0, max: 50, step: 1 },
    },
    glowAnimation: {
      control: "select",
      options: ["instant", "ease", "spring"],
    },
    movementSpeed: {
      control: { type: "number", min: 0.05, max: 2, step: 0.05 },
    },
    mouseInfluence: {
      control: { type: "number", min: 20, max: 300, step: 10 },
    },
    mouseGravity: {
      control: "select",
      options: ["attract", "repel"],
    },
    gravityStrength: {
      control: { type: "number", min: 10, max: 200, step: 5 },
    },
    starsInteraction: {
      control: "boolean",
    },
    starsInteractionType: {
      control: "select",
      options: ["bounce", "merge"],
    },
  },
} satisfies Meta<typeof GravityStarsBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground {...args}>
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Move your mouse</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const Attract: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground mouseGravity="attract" gravityStrength={100}>
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Attract</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const Repel: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground mouseGravity="repel" gravityStrength={100}>
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Repel</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const WithBounceInteraction: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground
        starsInteraction
        starsInteractionType="bounce"
        starsCount={50}
        starsSize={3}
      >
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Bouncing Stars</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const WithMergeInteraction: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground
        starsInteraction
        starsInteractionType="merge"
        starsCount={100}
        glowIntensity={25}
      >
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Merging Stars</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const Dense: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground starsCount={200} starsSize={1} glowIntensity={5} movementSpeed={0.1}>
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Dense Star Field</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}

export const SpringGlow: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black text-white">
      <GravityStarsBackground glowAnimation="spring" glowIntensity={30} starsCount={60}>
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <h1 className="text-4xl font-bold">Spring Glow</h1>
        </div>
      </GravityStarsBackground>
    </div>
  ),
}
