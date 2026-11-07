import { BRAND_NAME } from "@repo/sites"
import { Brand, BrandMark } from "@repo/ui/components/brand"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Brand",
  component: Brand,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { href: "https://www.brand.com" },
} satisfies Meta<typeof Brand>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: BRAND_NAME })
    await expect(link).toHaveAttribute("href", "https://www.brand.com")
  },
}

export const CustomName: Story = {
  args: { name: "Acme" },
}

export const MarkOnly: Story = {
  render: () => <BrandMark className="size-10" />,
}
