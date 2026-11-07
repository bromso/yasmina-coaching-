import { ShinyButton } from "@repo/ui/components/shiny-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Buttons/ShinyButton",
  component: ShinyButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
  args: {
    // Stories override this or render their own buttons; it only satisfies the required prop.
    children: "Shiny Button",
  },
} satisfies Meta<typeof ShinyButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Shiny Button",
  },
}

export const WithCustomClass: Story = {
  args: {
    children: "Custom Styled",
    className: "px-8 py-3",
  },
}

export const MultipleButtons: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <ShinyButton>Primary</ShinyButton>
      <ShinyButton className="px-8 py-3">Larger</ShinyButton>
      <ShinyButton className="rounded-full px-6">Rounded</ShinyButton>
    </div>
  ),
}
