import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/animate-ui/components/radix/sheet"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Sheet",
  component: Sheet,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
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
            Make changes to your profile here. Click save when you are done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 p-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sheet-name" className="text-right">
              Name
            </Label>
            <Input id="sheet-name" defaultValue="John Doe" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sheet-username" className="text-right">
              Username
            </Label>
            <Input id="sheet-username" defaultValue="@johndoe" className="col-span-3" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse through the application sections.</SheetDescription>
        </SheetHeader>
        <div className="p-4 space-y-2">
          <Button variant="ghost" className="w-full justify-start">
            Home
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Dashboard
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Settings
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Help
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notification Center</SheetTitle>
          <SheetDescription>Your recent notifications.</SheetDescription>
        </SheetHeader>
        <div className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground">No new notifications.</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
          <SheetDescription>Common actions you can take.</SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 p-4">
          <Button variant="outline" className="flex-1">
            New File
          </Button>
          <Button variant="outline" className="flex-1">
            Upload
          </Button>
          <Button variant="outline" className="flex-1">
            Share
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const WithoutCloseButton: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">No Close Button</Button>
      </SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Custom Close</SheetTitle>
          <SheetDescription>This sheet hides the default close button.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose asChild>
            <Button>Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}
