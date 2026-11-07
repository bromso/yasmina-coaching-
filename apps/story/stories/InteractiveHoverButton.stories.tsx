import { InteractiveHoverButton } from "@repo/ui/components/interactive-hover-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Buttons/InteractiveHoverButton",
  component: InteractiveHoverButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof InteractiveHoverButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Hover me",
  },
}

export const GetStarted: Story = {
  args: {
    children: "Get Started",
  },
}

export const LearnMore: Story = {
  args: {
    children: "Learn More",
  },
}

export const CustomStyled: Story = {
  args: {
    children: "Custom",
    className: "text-lg",
  },
}

export const MultipleButtons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <InteractiveHoverButton>Sign Up</InteractiveHoverButton>
      <InteractiveHoverButton>Explore</InteractiveHoverButton>
      <InteractiveHoverButton>Contact</InteractiveHoverButton>
    </div>
  ),
}
