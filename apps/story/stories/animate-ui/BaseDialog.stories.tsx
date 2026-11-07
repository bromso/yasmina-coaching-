import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/animate-ui/components/base/dialog"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Dialog",
  component: Dialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open Dialog</DialogTrigger>
      <DialogPopup>
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
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  ),
}

export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open Dialog</DialogTrigger>
      <DialogPopup showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>No close button</DialogTitle>
          <DialogDescription>
            This dialog does not show the X close button in the top-right corner.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Got it</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  ),
}

export const LongContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Terms of Service</DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
          <DialogDescription>Please read the following terms carefully.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto space-y-4 py-4">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholder paragraphs, never reordered
            <p key={i} className="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
              exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Decline</DialogClose>
          <DialogClose render={<Button />}>Accept</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  ),
}
