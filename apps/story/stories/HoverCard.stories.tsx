import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar"
import { Button } from "@repo/ui/components/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@repo/ui/components/hover-card"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Surfaces/HoverCard",
  component: HoverCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    openDelay: {
      control: { type: "number", min: 0, max: 1000 },
      description: "Delay in ms before opening (default: 700)",
    },
    closeDelay: {
      control: { type: "number", min: 0, max: 1000 },
      description: "Delay in ms before closing (default: 300)",
    },
  },
} satisfies Meta<typeof HoverCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">@nextjs</Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex justify-between space-x-4">
          <Avatar>
            <AvatarImage src="https://github.com/vercel.png" />
            <AvatarFallback>VC</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">@nextjs</h4>
            <p className="text-sm">The React Framework – created and maintained by @vercel.</p>
            <div className="flex items-center pt-2">
              <Icon
                icon="lucide:calendar"
                className="text-muted-foreground mr-2 size-4"
                aria-hidden="true"
              />
              <span className="text-muted-foreground text-xs">Joined December 2021</span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /@nextjs/i })

    await expect(trigger).toBeInTheDocument()
    // Note: Hover card interaction tested manually - hover triggers are timing-sensitive in Vitest
  },
}

export const Simple: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer underline">Hover me</span>
      </HoverCardTrigger>
      <HoverCardContent>
        <p className="text-sm">This is a simple hover card with some content.</p>
      </HoverCardContent>
    </HoverCard>
  ),
}

export const WithStats: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="outline">View Stats</Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Project Statistics</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs">Downloads</p>
              <p className="text-lg font-bold">1.2M</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Stars</p>
              <p className="text-lg font-bold">24.5K</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Forks</p>
              <p className="text-lg font-bold">3.2K</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Contributors</p>
              <p className="text-lg font-bold">156</p>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}
