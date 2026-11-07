import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Feedback/Alert",
  component: Alert,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive"],
    },
  },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <Icon icon="lucide:terminal" aria-hidden="true" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const alert = canvas.getByRole("alert")

    await expect(alert).toBeInTheDocument()
    await expect(canvas.getByText("Heads up!")).toBeInTheDocument()
    await expect(canvas.getByText(/add components/i)).toBeInTheDocument()
  },
}

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-[400px]">
      <Icon icon="lucide:alert-circle" aria-hidden="true" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  ),
}

export const Success: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <Icon icon="lucide:check-circle" className="text-green-500" aria-hidden="true" />
      <AlertTitle>Success!</AlertTitle>
      <AlertDescription>Your changes have been saved successfully.</AlertDescription>
    </Alert>
  ),
}

export const Information: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <Icon icon="lucide:info" aria-hidden="true" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        This feature is currently in beta. Some functionality may change.
      </AlertDescription>
    </Alert>
  ),
}

export const WithoutIcon: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>This is an alert without an icon.</AlertDescription>
    </Alert>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-[400px]">
      <Alert>
        <Icon icon="lucide:info" aria-hidden="true" />
        <AlertTitle>Default Alert</AlertTitle>
        <AlertDescription>This is the default alert style.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <Icon icon="lucide:alert-circle" aria-hidden="true" />
        <AlertTitle>Destructive Alert</AlertTitle>
        <AlertDescription>This is the destructive alert style.</AlertDescription>
      </Alert>
    </div>
  ),
}
