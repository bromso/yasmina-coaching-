import { LogoCloud } from "@repo/ui/blocks/logo-cloud"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const logos = [
  { name: "Acme", src: "https://placehold.co/80x24?text=Acme" },
  { name: "Globex", src: "https://placehold.co/80x24?text=Globex" },
  { name: "Initech", src: "https://placehold.co/80x24?text=Initech" },
  { name: "Umbrella", src: "https://placehold.co/80x24?text=Umbrella" },
]

const meta = {
  title: "Blocks/LogoCloud",
  component: LogoCloud,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: { title: "Trusted by teams at", logos },
} satisfies Meta<typeof LogoCloud>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const list = canvas.getByRole("list")
    await expect(within(list).getAllByRole("listitem")).toHaveLength(logos.length)
  },
}

export const WithoutTitle: Story = {
  args: { title: undefined },
}
