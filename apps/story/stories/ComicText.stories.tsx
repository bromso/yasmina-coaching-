import { ComicText } from "@repo/ui/components/comic-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/ComicText",
  component: ComicText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    fontSize: {
      control: { type: "range", min: 1, max: 10, step: 0.5 },
    },
  },
  args: {
    children: "POW!",
    fontSize: 5,
  },
} satisfies Meta<typeof ComicText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Boom: Story = {
  args: {
    children: "BOOM!",
  },
}

export const Wham: Story = {
  args: {
    children: "WHAM!",
  },
}

export const LongText: Story = {
  args: {
    children: "HOLY SMOKES!",
    fontSize: 4,
  },
}

export const SmallSize: Story = {
  args: {
    children: "ZAP!",
    fontSize: 2,
  },
}

export const LargeSize: Story = {
  args: {
    children: "BAM!",
    fontSize: 8,
  },
}
