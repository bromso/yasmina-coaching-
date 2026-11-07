import { Button } from "@repo/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Surfaces/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText("Card Title")).toBeInTheDocument()
    await expect(canvas.getByText("Card description goes here.")).toBeInTheDocument()
    await expect(canvas.getByRole("button", { name: /action/i })).toBeInTheDocument()
  },
}

export const WithAction: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>You have 3 unread messages.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="More options">
            <Icon icon="lucide:more-horizontal" className="size-4" aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>Notification content goes here.</p>
      </CardContent>
    </Card>
  ),
}

export const LoginForm: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Login</CardTitle>
        <CardDescription>Enter your credentials to access your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="m@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Login</Button>
      </CardFooter>
    </Card>
  ),
}

export const Minimal: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardContent>
        <p>A minimal card with just content.</p>
      </CardContent>
    </Card>
  ),
}

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Header Only Card</CardTitle>
        <CardDescription>This card has only a header section.</CardDescription>
      </CardHeader>
    </Card>
  ),
}
