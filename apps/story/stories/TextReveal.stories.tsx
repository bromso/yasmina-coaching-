import { TextReveal } from "@repo/ui/components/text-reveal"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/TextReveal",
  component: TextReveal,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
  },
  args: {
    children:
      "Scroll down to reveal this text word by word. Each word fades in as you scroll through the content area.",
  },
} satisfies Meta<typeof TextReveal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ShortText: Story = {
  args: {
    children: "Short reveal text that appears quickly.",
  },
}

export const LongText: Story = {
  args: {
    children:
      "This is a much longer piece of text that will reveal itself word by word as you scroll. It demonstrates how the component handles paragraphs with many words, creating a dramatic reading experience that draws the user in.",
  },
}
