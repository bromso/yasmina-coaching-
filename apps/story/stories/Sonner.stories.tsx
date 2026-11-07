import { Button } from "@repo/ui/components/button"
import { Toaster } from "@repo/ui/components/sonner"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { toast } from "sonner"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Feedback/Sonner",
  component: Toaster,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    position: {
      control: "select",
      options: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
      description: "Position of the toast notifications",
    },
    expand: {
      control: "boolean",
      description: "Whether toasts should expand to show full content",
    },
    richColors: {
      control: "boolean",
      description: "Whether to use rich colors for different toast types",
    },
    closeButton: {
      control: "boolean",
      description: "Whether to show a close button on toasts",
    },
    duration: {
      control: { type: "number", min: 1000, max: 30000 },
      description: "Duration in ms before auto-dismissing (default: 4000)",
    },
  },
  decorators: [
    (Story) => (
      <div>
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
        })
      }
    >
      Show Toast
    </Button>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole("button", { name: /show toast/i })

    await expect(button).toBeInTheDocument()
    await userEvent.click(button)

    const toastText = await within(document.body).findByText("Event has been created")
    await expect(toastText).toBeInTheDocument()
  },
}

export const Success: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.success("Successfully saved!", {
          description: "Your changes have been saved.",
        })
      }
    >
      Show Success Toast
    </Button>
  ),
}

export const ErrorToast: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.error("Error occurred", {
          description: "Something went wrong. Please try again.",
        })
      }
    >
      Show Error Toast
    </Button>
  ),
}

export const Warning: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.warning("Warning", {
          description: "This action cannot be undone.",
        })
      }
    >
      Show Warning Toast
    </Button>
  ),
}

export const Info: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.info("Did you know?", {
          description: "You can customize this toast component.",
        })
      }
    >
      Show Info Toast
    </Button>
  ),
}

export const Loading: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => {
        const toastId = toast.loading("Loading...")
        setTimeout(() => {
          toast.success("Done!", { id: toastId })
        }, 2000)
      }}
    >
      Show Loading Toast
    </Button>
  ),
}

export const WithAction: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event deleted", {
          description: "The event has been removed from your calendar.",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo clicked"),
          },
        })
      }
    >
      Show Toast with Action
    </Button>
  ),
}

export const PromiseToast: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => {
        const promise = new Promise((resolve) => setTimeout(resolve, 2000))
        toast.promise(promise, {
          loading: "Uploading...",
          success: "Upload complete!",
          error: "Upload failed",
        })
      }}
    >
      Show Promise Toast
    </Button>
  ),
}

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast("Default toast")}>
        Default
      </Button>
      <Button variant="outline" onClick={() => toast.success("Success!")}>
        Success
      </Button>
      <Button variant="outline" onClick={() => toast.error("Error!")}>
        Error
      </Button>
      <Button variant="outline" onClick={() => toast.warning("Warning!")}>
        Warning
      </Button>
      <Button variant="outline" onClick={() => toast.info("Info!")}>
        Info
      </Button>
    </div>
  ),
}
