import { SparklesText } from "@repo/ui/components/sparkles-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/SparklesText",
  component: SparklesText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    sparklesCount: {
      control: { type: "range", min: 1, max: 30, step: 1 },
    },
    colors: {
      control: { type: "object" },
    },
  },
  args: {
    children: "Sparkles",
    sparklesCount: 10,
    colors: { first: "#9E7AFF", second: "#FE8BBB" },
  },
} satisfies Meta<typeof SparklesText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FewSparkles: Story = {
  args: {
    children: "Subtle",
    sparklesCount: 3,
  },
}

export const ManySparkles: Story = {
  args: {
    children: "Party Time",
    sparklesCount: 25,
  },
}

export const GoldTheme: Story = {
  args: {
    children: "Premium",
    colors: { first: "#FFD700", second: "#FFA500" },
  },
}

export const OceanTheme: Story = {
  args: {
    children: "Ocean",
    colors: { first: "#0ea5e9", second: "#06b6d4" },
  },
}

export const ChristmasTheme: Story = {
  args: {
    children: "Merry Christmas",
    colors: { first: "#ef4444", second: "#22c55e" },
  },
}

export const SmallText: Story = {
  args: {
    children: "Small sparkles",
    className: "text-2xl",
  },
}
