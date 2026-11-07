import { ScrollArea, ScrollBar } from "@repo/ui/components/scroll-area"
import { Separator } from "@repo/ui/components/separator"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Layout/ScrollArea",
  component: ScrollArea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["auto", "always", "scroll", "hover"],
      description: "Scrollbar visibility behavior",
    },
    scrollHideDelay: {
      control: { type: "number", min: 0, max: 2000 },
      description: "Delay in ms before hiding scrollbars (default: 600)",
    },
  },
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

const tags = Array.from({ length: 50 }).map((_, i, a) => `v1.2.0-beta.${a.length - i}`)

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText("Tags")).toBeInTheDocument()
    await expect(canvas.getByText("v1.2.0-beta.50")).toBeInTheDocument()
  },
}

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <figure key={`horizontal-img-${num}`} className="shrink-0">
            <div className="bg-muted flex h-32 w-48 items-center justify-center overflow-hidden rounded-md">
              <span className="text-muted-foreground">Image {num}</span>
            </div>
            <figcaption className="text-muted-foreground pt-2 text-xs">
              Photo by Photographer {num}
            </figcaption>
          </figure>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
}

export const Both: Story = {
  render: () => (
    <ScrollArea className="h-[300px] w-[350px] rounded-md border p-4">
      <div className="w-[600px]">
        <h4 className="mb-4 text-sm font-medium leading-none">Content</h4>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((num) => (
          <p key={`paragraph-${num}`} className="text-sm">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam pulvinar risus non risus
            hendrerit venenatis. Pellentesque sit amet hendrerit risus, sed porttitor quam.
          </p>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
}
