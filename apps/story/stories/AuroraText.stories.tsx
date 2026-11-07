import { AuroraText } from "@repo/ui/components/aurora-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/AuroraText",
  component: AuroraText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    speed: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
    },
    colors: {
      control: { type: "object" },
    },
  },
  args: {
    children: "Aurora Text",
    speed: 1,
  },
} satisfies Meta<typeof AuroraText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "text-6xl font-bold",
  },
}

export const SlowAnimation: Story = {
  args: {
    children: "Slow Aurora",
    speed: 0.3,
    className: "text-6xl font-bold",
  },
}

export const FastAnimation: Story = {
  args: {
    children: "Fast Aurora",
    speed: 4,
    className: "text-6xl font-bold",
  },
}

export const OceanColors: Story = {
  args: {
    children: "Ocean",
    colors: ["#0ea5e9", "#06b6d4", "#2563eb", "#7c3aed"],
    className: "text-8xl font-extrabold",
  },
}

export const SunsetColors: Story = {
  args: {
    children: "Sunset",
    colors: ["#f97316", "#ef4444", "#ec4899", "#f59e0b"],
    className: "text-8xl font-extrabold",
  },
}

export const NatureColors: Story = {
  args: {
    children: "Nature",
    colors: ["#22c55e", "#10b981", "#14b8a6", "#06b6d4"],
    className: "text-8xl font-extrabold",
  },
}

export const SmallText: Story = {
  args: {
    children: "Small aurora text for inline use",
    className: "text-lg font-medium",
  },
}
