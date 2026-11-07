import { Breadcrumbs } from "@repo/ui/blocks/breadcrumbs"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/Breadcrumbs",
  component: Breadcrumbs,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    items: [
      { title: "Docs", href: "/docs" },
      { title: "Authentication", href: "/docs/authentication" },
      { title: "OAuth" },
    ],
  },
} satisfies Meta<typeof Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    await expect(canvas.getByText("OAuth")).toHaveAttribute("aria-current", "page")
  },
}

/** Review Focus 1: a folder with no index page shows its name without a link. */
export const FolderWithoutAnIndexPage: Story = {
  args: {
    items: [
      { title: "Docs" },
      { title: "Architecture", href: "/docs/architecture" },
      { title: "Overview" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("link", { name: "Docs" })).not.toBeInTheDocument()
    await expect(canvas.getByText("Docs")).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { items: [{ title: "Docs" }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument()
  },
}
