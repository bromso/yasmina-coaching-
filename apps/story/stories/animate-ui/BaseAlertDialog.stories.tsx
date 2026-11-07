import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/animate-ui/components/base/alert-dialog"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Alert Dialog",
  component: AlertDialog,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AlertDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete account</AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your account and remove your
            data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  ),
}

export const DestructiveAction: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Delete project
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this project? All associated data, files, and settings
            will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep project</AlertDialogCancel>
          <AlertDialogAction>Yes, delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  ),
}
