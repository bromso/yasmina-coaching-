import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Surfaces/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    modal: {
      control: "boolean",
      description: "Whether the sheet should block interaction with the rest of the page",
    },
  },
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input id="name" defaultValue="Pedro Duarte" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input id="username" defaultValue="@peduarte" className="col-span-3" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="submit">Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /open sheet/i })

    await expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)

    const sheet = await within(document.body).findByRole("dialog")
    await expect(sheet).toBeInTheDocument()
    await expect(within(sheet).getByText("Edit profile")).toBeInTheDocument()
  },
}

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse through the menu options.</SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <nav className="flex flex-col gap-2">
            <Button variant="ghost" className="justify-start">
              Home
            </Button>
            <Button variant="ghost" className="justify-start">
              About
            </Button>
            <Button variant="ghost" className="justify-start">
              Services
            </Button>
            <Button variant="ghost" className="justify-start">
              Contact
            </Button>
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const Top: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notification</SheetTitle>
          <SheetDescription>You have a new message.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Cookies</SheetTitle>
          <SheetDescription>
            We use cookies to improve your experience. By continuing, you agree to our use of
            cookies.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter className="mt-4">
          <SheetClose asChild>
            <Button variant="outline">Decline</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button>Accept</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}
