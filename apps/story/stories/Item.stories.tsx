import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar"
import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@repo/ui/components/item"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Item",
  component: Item,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "muted"],
      description: "The visual style variant of the item",
    },
    size: {
      control: "select",
      options: ["default", "sm"],
      description: "The size of the item",
    },
  },
} satisfies Meta<typeof Item>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Item className="w-[400px]">
      <ItemMedia variant="icon">
        <Icon icon="lucide:file" aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Document.pdf</ItemTitle>
        <ItemDescription>Last modified 2 hours ago</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="icon" aria-label="More options">
          <Icon icon="lucide:more-horizontal" aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText("Document.pdf")).toBeInTheDocument()
    await expect(canvas.getByText("Last modified 2 hours ago")).toBeInTheDocument()
    await expect(canvas.getByRole("button")).toBeInTheDocument()
  },
}

export const WithAvatar: Story = {
  render: () => (
    <Item className="w-[400px]">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <ItemContent>
        <ItemTitle>John Doe</ItemTitle>
        <ItemDescription>john@example.com</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm">
          View Profile
        </Button>
      </ItemActions>
    </Item>
  ),
}

export const WithImage: Story = {
  render: () => (
    <Item className="w-[400px]">
      <ItemMedia variant="image">
        <img
          src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=100&h=100&fit=crop"
          alt="Thumbnail"
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Beautiful Sunset</ItemTitle>
        <ItemDescription>A photo from last summer vacation.</ItemDescription>
      </ItemContent>
    </Item>
  ),
}

export const Outline: Story = {
  render: () => (
    <Item variant="outline" className="w-[400px]">
      <ItemMedia variant="icon">
        <Icon icon="lucide:folder" aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Projects</ItemTitle>
        <ItemDescription>12 items</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="icon" aria-label="Open folder">
          <Icon icon="lucide:chevron-right" aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  ),
}

export const Muted: Story = {
  render: () => (
    <Item variant="muted" className="w-[400px]">
      <ItemMedia variant="icon">
        <Icon icon="lucide:bell" aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Notification</ItemTitle>
        <ItemDescription>You have 3 new messages</ItemDescription>
      </ItemContent>
    </Item>
  ),
}

export const InGroup: Story = {
  render: () => (
    <ItemGroup className="w-[400px] border rounded-md">
      <Item>
        <ItemMedia variant="icon">
          <Icon icon="lucide:file-text" aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Document 1</ItemTitle>
          <ItemDescription>Created yesterday</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <Icon icon="lucide:file-image" aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Image 1</ItemTitle>
          <ItemDescription>Created last week</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item>
        <ItemMedia variant="icon">
          <Icon icon="lucide:file-video" aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Video 1</ItemTitle>
          <ItemDescription>Created last month</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
}

export const Small: Story = {
  render: () => (
    <Item size="sm" className="w-[400px]">
      <ItemMedia variant="icon">
        <Icon icon="lucide:check-circle" className="text-green-500" aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Task completed</ItemTitle>
      </ItemContent>
    </Item>
  ),
}
