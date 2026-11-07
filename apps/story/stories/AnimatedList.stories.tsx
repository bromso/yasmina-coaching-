import { AnimatedList } from "@repo/ui/components/animated-list"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/AnimatedList",
  component: AnimatedList,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delay: {
      control: { type: "number", min: 100, max: 5000, step: 100 },
      description: "Delay in milliseconds between each item appearing",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    delay: 1000,
  },
} satisfies Meta<typeof AnimatedList>

export default meta
type Story = StoryObj<typeof meta>

function NotificationItem({ name, message }: { name: string; message: string }) {
  return (
    <div className="flex w-[350px] items-center gap-3 rounded-lg border bg-white p-3 shadow-sm dark:bg-zinc-900">
      <div className="flex size-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
        {name[0]}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-xs">{message}</p>
      </div>
    </div>
  )
}

const notifications = [
  { name: "Alice", message: "Just joined the workspace" },
  { name: "Bob", message: "Completed the onboarding" },
  { name: "Charlie", message: "Uploaded a new document" },
  { name: "Diana", message: "Left a comment on your post" },
  { name: "Eve", message: "Shared a file with you" },
]

export const Default: Story = {
  render: (args) => (
    <AnimatedList {...args} className="w-[350px]">
      {notifications.map((n) => (
        <NotificationItem key={n.name} name={n.name} message={n.message} />
      ))}
    </AnimatedList>
  ),
}

export const FastDelay: Story = {
  args: {
    delay: 300,
  },
  render: (args) => (
    <AnimatedList {...args} className="w-[350px]">
      {notifications.map((n) => (
        <NotificationItem key={n.name} name={n.name} message={n.message} />
      ))}
    </AnimatedList>
  ),
}

export const SlowDelay: Story = {
  args: {
    delay: 3000,
  },
  render: (args) => (
    <AnimatedList {...args} className="w-[350px]">
      {notifications.map((n) => (
        <NotificationItem key={n.name} name={n.name} message={n.message} />
      ))}
    </AnimatedList>
  ),
}

export const SimpleItems: Story = {
  render: (args) => (
    <AnimatedList {...args} className="w-[300px]">
      <div className="rounded-md border px-4 py-2 text-sm">First item</div>
      <div className="rounded-md border px-4 py-2 text-sm">Second item</div>
      <div className="rounded-md border px-4 py-2 text-sm">Third item</div>
      <div className="rounded-md border px-4 py-2 text-sm">Fourth item</div>
    </AnimatedList>
  ),
}
