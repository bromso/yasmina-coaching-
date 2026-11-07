import {
  Particles,
  ParticlesEffect,
} from "@repo/ui/components/animate-ui/primitives/effects/particles"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"

const meta = {
  title: "Animate UI/Effects/Particles",
  component: Particles,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    animate: {
      control: "boolean",
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    animate: true,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof Particles>

export default meta
// Particles takes a union of props: an `asChild` variant, whose only child must be one element,
// and a plain one. Every story renders Particles itself around several children, so stories take
// the plain variant's props.
type Story = StoryObj<Extract<ComponentProps<typeof Particles>, { asChild?: false }>>

export const Default: Story = {
  render: (args) => (
    <Particles {...args}>
      <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">Particles</h3>
        <p className="text-sm text-muted-foreground">Particles emanate from the edges.</p>
      </div>
      <ParticlesEffect
        side="top"
        count={5}
        radius={40}
        className="size-2 rounded-full bg-primary"
      />
      <ParticlesEffect
        side="bottom"
        count={5}
        radius={40}
        className="size-2 rounded-full bg-primary"
      />
    </Particles>
  ),
}

export const AllSides: Story = {
  render: (args) => (
    <Particles {...args}>
      <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <h3 className="text-lg font-semibold">All Sides</h3>
      </div>
      <ParticlesEffect
        side="top"
        count={4}
        radius={30}
        className="size-2 rounded-full bg-red-500"
      />
      <ParticlesEffect
        side="bottom"
        count={4}
        radius={30}
        className="size-2 rounded-full bg-blue-500"
      />
      <ParticlesEffect
        side="left"
        count={4}
        radius={30}
        className="size-2 rounded-full bg-green-500"
      />
      <ParticlesEffect
        side="right"
        count={4}
        radius={30}
        className="size-2 rounded-full bg-yellow-500"
      />
    </Particles>
  ),
}

export const ManyParticles: Story = {
  render: (args) => (
    <Particles {...args}>
      <div className="rounded-full bg-primary text-primary-foreground size-16 flex items-center justify-center font-bold text-xl shadow-lg">
        !
      </div>
      <ParticlesEffect
        side="top"
        count={12}
        radius={50}
        spread={360}
        className="size-1.5 rounded-full bg-primary/70"
      />
    </Particles>
  ),
}
