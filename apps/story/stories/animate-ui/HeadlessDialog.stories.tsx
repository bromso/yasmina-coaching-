import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@repo/ui/components/animate-ui/components/headless/dialog"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import React from "react"

const meta = {
  title: "Animate UI/Headless/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: function DefaultDialog() {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open Dialog
        </Button>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Make changes to your profile here. Click save when you are done.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">Dialog content goes here.</p>
            </div>
            <DialogFooter>
              <DialogClose as={Button} variant="outline">
                Cancel
              </DialogClose>
              <Button onClick={() => setOpen(false)}>Save changes</Button>
            </DialogFooter>
          </DialogPanel>
        </Dialog>
      </>
    )
  },
}

export const WithoutCloseButton: Story = {
  render: function NoCloseDialog() {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open Dialog
        </Button>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogPanel showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>No close button</DialogTitle>
              <DialogDescription>
                This dialog does not show the X close button in the top-right corner.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Got it</Button>
            </DialogFooter>
          </DialogPanel>
        </Dialog>
      </>
    )
  },
}

export const Confirmation: Story = {
  render: function ConfirmDialog() {
    const [open, setOpen] = React.useState(false)

    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogPanel>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete your account and all
                associated data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose as={Button} variant="outline">
                Cancel
              </DialogClose>
              <Button variant="destructive" onClick={() => setOpen(false)}>
                Delete
              </Button>
            </DialogFooter>
          </DialogPanel>
        </Dialog>
      </>
    )
  },
}
