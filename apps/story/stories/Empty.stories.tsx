import { Button } from "@repo/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Layout/Empty",
  component: Empty,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Empty>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Empty className="border w-[400px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon="lucide:inbox" className="size-6" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No results found</EmptyTitle>
        <EmptyDescription>
          We couldn't find any items matching your search. Try adjusting your filters.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>Clear filters</Button>
      </EmptyContent>
    </Empty>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText("No results found")).toBeInTheDocument()
    await expect(
      canvas.getByText(/We couldn't find any items matching your search/)
    ).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /clear filters/i })).toBeInTheDocument()
  },
}

export const NoData: Story = {
  render: () => (
    <Empty className="border w-[400px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon="lucide:file-text" className="size-6" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No documents yet</EmptyTitle>
        <EmptyDescription>Get started by creating your first document.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <Icon icon="lucide:plus" className="mr-2 size-4" aria-hidden="true" />
          Create document
        </Button>
      </EmptyContent>
    </Empty>
  ),
}

export const ErrorState: Story = {
  render: () => (
    <Empty className="border w-[400px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon
            icon="lucide:alert-triangle"
            className="size-6 text-destructive"
            aria-hidden="true"
          />
        </EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>
          We encountered an error while loading. Please try again later.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">Retry</Button>
      </EmptyContent>
    </Empty>
  ),
}

export const Simple: Story = {
  render: () => (
    <Empty className="border w-[400px]">
      <EmptyHeader>
        <EmptyTitle>Empty state</EmptyTitle>
        <EmptyDescription>This is a simple empty state without an icon.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
}

export const WithImage: Story = {
  render: () => (
    <Empty className="border w-[400px]">
      <EmptyHeader>
        <EmptyMedia>
          <div className="bg-muted flex size-24 items-center justify-center rounded-full">
            <Icon
              icon="lucide:image"
              className="size-12 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </EmptyMedia>
        <EmptyTitle>No images</EmptyTitle>
        <EmptyDescription>Upload your first image to get started.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <Icon icon="lucide:upload" className="mr-2 size-4" aria-hidden="true" />
          Upload image
        </Button>
      </EmptyContent>
    </Empty>
  ),
}
