import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/ui/components/animate-ui/components/radix/hover-card"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/HoverCard",
  component: HoverCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof HoverCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium underline underline-offset-4"
        >
          @github
        </a>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">GitHub</h4>
          <p className="text-sm text-muted-foreground">
            The platform for building and shipping software, together.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Joined December 2007</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}

export const WithAvatar: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer text-sm font-medium underline underline-offset-4">
          Hover over me
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
            JD
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-semibold">Jane Doe</h4>
            <p className="text-xs text-muted-foreground">Software Engineer at Acme Corp.</p>
            <p className="text-xs text-muted-foreground">Building things that matter.</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}
