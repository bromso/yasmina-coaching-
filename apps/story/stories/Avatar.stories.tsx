import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

const meta = {
  title: "Components/Data Display/Avatar",
  component: Avatar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
  play: async ({ canvasElement }) => {
    // Avatar shows either the image (if loaded) or the fallback
    const avatar = canvasElement.querySelector("[data-slot='avatar']")
    await expect(avatar).toBeInTheDocument()
  },
}

export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://invalid-url.com/image.png" alt="User" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="size-6">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-8">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-16">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    </div>
  ),
}

export const Group: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <Avatar className="border-background border-2">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarFallback>+3</AvatarFallback>
      </Avatar>
    </div>
  ),
}
