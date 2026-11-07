import {
  AvatarGroup,
  AvatarGroupTooltip,
} from "@repo/ui/components/animate-ui/components/animate/avatar-group"
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/AvatarGroup",
  component: AvatarGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AvatarGroup>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

const users = [
  { name: "Alice Johnson", initials: "AJ", image: "https://i.pravatar.cc/150?u=alice" },
  { name: "Bob Smith", initials: "BS", image: "https://i.pravatar.cc/150?u=bob" },
  { name: "Carol White", initials: "CW", image: "https://i.pravatar.cc/150?u=carol" },
  { name: "David Lee", initials: "DL", image: "https://i.pravatar.cc/150?u=david" },
  { name: "Eve Brown", initials: "EB", image: "https://i.pravatar.cc/150?u=eve" },
]

export const Default: Story = {
  render: () => (
    <AvatarGroup>
      {users.map((user) => (
        <Avatar key={user.name} className="size-12 border-2 border-background">
          <AvatarImage src={user.image} alt={user.name} />
          <AvatarFallback>{user.initials}</AvatarFallback>
          <AvatarGroupTooltip>{user.name}</AvatarGroupTooltip>
        </Avatar>
      ))}
    </AvatarGroup>
  ),
}

export const WithoutTooltips: Story = {
  render: () => (
    <AvatarGroup>
      {users.slice(0, 3).map((user) => (
        <Avatar key={user.name} className="size-12 border-2 border-background">
          <AvatarImage src={user.image} alt={user.name} />
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  ),
}

export const FallbackOnly: Story = {
  render: () => (
    <AvatarGroup>
      {users.map((user) => (
        <Avatar key={user.name} className="size-12 border-2 border-background">
          <AvatarFallback>{user.initials}</AvatarFallback>
          <AvatarGroupTooltip>{user.name}</AvatarGroupTooltip>
        </Avatar>
      ))}
    </AvatarGroup>
  ),
}

export const InvertedOverlap: Story = {
  render: () => (
    <AvatarGroup invertOverlap={false}>
      {users.map((user) => (
        <Avatar key={user.name} className="size-12 border-2 border-background">
          <AvatarImage src={user.image} alt={user.name} />
          <AvatarFallback>{user.initials}</AvatarFallback>
          <AvatarGroupTooltip>{user.name}</AvatarGroupTooltip>
        </Avatar>
      ))}
    </AvatarGroup>
  ),
}
