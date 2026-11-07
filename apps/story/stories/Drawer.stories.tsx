import { Button } from "@repo/ui/components/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/ui/components/drawer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Navigation/Drawer",
  component: Drawer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    direction: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
      description: "The direction from which the drawer appears",
    },
    shouldScaleBackground: {
      control: "boolean",
      description: "Whether the background should scale when drawer opens",
    },
  },
} satisfies Meta<typeof Drawer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open Drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit profile</DrawerTitle>
          <DrawerDescription>Make changes to your profile here.</DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          <p className="text-muted-foreground text-sm">
            This is the drawer content. You can put any content here.
          </p>
        </div>
        <DrawerFooter>
          <Button>Save changes</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /open drawer/i })

    await expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)

    const drawer = await within(document.body).findByRole("dialog")
    await expect(drawer).toBeInTheDocument()
    await expect(within(drawer).getByText("Edit profile")).toBeInTheDocument()
  },
}

export const FromLeft: Story = {
  render: () => (
    <Drawer direction="left">
      <DrawerTrigger asChild>
        <Button variant="outline">Open from Left</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Navigation</DrawerTitle>
          <DrawerDescription>Choose where to go next.</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 p-4">
          <Button variant="ghost" className="justify-start">
            Home
          </Button>
          <Button variant="ghost" className="justify-start">
            About
          </Button>
          <Button variant="ghost" className="justify-start">
            Contact
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  ),
}

export const FromRight: Story = {
  render: () => (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="outline">Open from Right</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>Manage your preferences.</DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          <p className="text-muted-foreground text-sm">Settings content goes here.</p>
        </div>
      </DrawerContent>
    </Drawer>
  ),
}

export const FromTop: Story = {
  render: () => (
    <Drawer direction="top">
      <DrawerTrigger asChild>
        <Button variant="outline">Open from Top</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Notifications</DrawerTitle>
          <DrawerDescription>You have 3 unread messages.</DrawerDescription>
        </DrawerHeader>
        <div className="p-4">
          <p className="text-muted-foreground text-sm">Notification content here.</p>
        </div>
      </DrawerContent>
    </Drawer>
  ),
}
