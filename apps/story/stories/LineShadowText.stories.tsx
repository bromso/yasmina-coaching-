import { LineShadowText } from "@repo/ui/components/line-shadow-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/LineShadowText",
  component: LineShadowText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    shadowColor: {
      control: { type: "color" },
    },
  },
  args: {
    children: "Shadow Text",
    shadowColor: "black",
  },
} satisfies Meta<typeof LineShadowText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "text-6xl font-bold",
  },
}

export const RedShadow: Story = {
  args: {
    children: "Danger Zone",
    shadowColor: "#ef4444",
    className: "text-6xl font-bold",
  },
}

export const BlueShadow: Story = {
  args: {
    children: "Cool Shadow",
    shadowColor: "#3b82f6",
    className: "text-6xl font-bold",
  },
}

export const PurpleShadow: Story = {
  args: {
    children: "Royal Vibes",
    shadowColor: "#8b5cf6",
    className: "text-6xl font-bold",
  },
}

export const SmallText: Story = {
  args: {
    children: "Smaller line shadow text",
    className: "text-2xl font-semibold",
  },
}

export const AsHeading: Story = {
  args: {
    children: "Heading Element",
    as: "h1",
    className: "text-7xl font-extrabold",
  },
}
