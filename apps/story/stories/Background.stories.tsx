import { Background } from "@repo/ui/components/background"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Coaching/Background",
  component: Background,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: { variant: { control: "inline-radio", options: ["top", "bottom"] } },
  args: {
    children: (
      <div className="px-6 py-24 text-center">
        <h1 className="text-5xl">Sidan finns inte</h1>
      </div>
    ),
  },
} satisfies Meta<typeof Background>

export default meta
type Story = StoryObj<typeof meta>

export const Top: Story = {}

export const Bottom: Story = { args: { variant: "bottom" } }
