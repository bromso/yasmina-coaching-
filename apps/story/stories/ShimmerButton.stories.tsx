import { ShimmerButton } from "@repo/ui/components/shimmer-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Buttons/ShimmerButton",
  component: ShimmerButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    shimmerColor: {
      control: "color",
      description: "Color of the shimmer effect",
    },
    shimmerSize: {
      control: "text",
      description: "Size of the shimmer cut (CSS value)",
    },
    shimmerDuration: {
      control: "text",
      description: "Duration of the shimmer animation (CSS time value)",
    },
    borderRadius: {
      control: "text",
      description: "Border radius (CSS value)",
    },
    background: {
      control: "color",
      description: "Background color of the button",
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof ShimmerButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Shimmer Button",
  },
}

export const CustomColors: Story = {
  args: {
    children: "Custom Shimmer",
    shimmerColor: "#FFD700",
    background: "rgba(30, 58, 138, 1)",
  },
}

export const FastShimmer: Story = {
  args: {
    children: "Fast Shimmer",
    shimmerDuration: "1s",
  },
}

export const RoundedSmall: Story = {
  args: {
    children: "Rounded",
    borderRadius: "8px",
  },
}

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ShimmerButton className="px-4 py-1.5 text-sm">Small</ShimmerButton>
      <ShimmerButton>Default</ShimmerButton>
      <ShimmerButton className="px-8 py-4 text-lg">Large</ShimmerButton>
    </div>
  ),
}
