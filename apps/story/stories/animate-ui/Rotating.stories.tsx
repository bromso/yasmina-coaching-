import {
  RotatingText,
  RotatingTextContainer,
} from "@repo/ui/components/animate-ui/primitives/texts/rotating"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Rotating",
  component: RotatingTextContainer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    duration: {
      control: { type: "number", min: 500, max: 10000, step: 500 },
    },
    delay: {
      control: { type: "number", min: 0, max: 5000, step: 100 },
    },
    y: {
      control: { type: "number", min: -100, max: 100, step: 10 },
    },
  },
  args: {
    // Every story passes its own `text`; this only satisfies the required prop.
    text: ["websites", "apps", "tools", "products"],
    duration: 2000,
    delay: 0,
    y: -50,
  },
} satisfies Meta<typeof RotatingTextContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 text-2xl font-semibold">
      <span>We build</span>
      <RotatingTextContainer {...args} text={["websites", "apps", "tools", "products"]}>
        <RotatingText className="text-primary" />
      </RotatingTextContainer>
    </div>
  ),
}

export const SlowRotation: Story = {
  render: (args) => (
    <div className="text-3xl font-bold">
      <RotatingTextContainer {...args} text={["React", "Vue", "Svelte", "Angular"]}>
        <RotatingText />
      </RotatingTextContainer>
    </div>
  ),
  args: {
    duration: 4000,
  },
}

export const FastRotation: Story = {
  render: (args) => (
    <div className="text-xl font-semibold">
      <RotatingTextContainer {...args} text={["Fast", "Quick", "Speedy", "Rapid"]}>
        <RotatingText />
      </RotatingTextContainer>
    </div>
  ),
  args: {
    duration: 800,
  },
}

export const SingleText: Story = {
  render: (args) => (
    <div className="text-2xl font-bold">
      <RotatingTextContainer {...args} text="Static Text">
        <RotatingText />
      </RotatingTextContainer>
    </div>
  ),
}
