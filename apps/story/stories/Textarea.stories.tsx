import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    placeholder: {
      control: "text",
    },
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: "Type your message here.",
    className: "w-[300px]",
    "aria-label": "Message textarea",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByRole("textbox")

    await expect(textarea).toBeInTheDocument()
    await userEvent.type(textarea, "Hello, this is a test message!")
    await expect(textarea).toHaveValue("Hello, this is a test message!")
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea placeholder="Type your message here." id="message" />
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    placeholder: "Disabled textarea",
    disabled: true,
    className: "w-[300px]",
    "aria-label": "Disabled textarea",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByRole("textbox")

    await expect(textarea).toBeDisabled()
  },
}

export const WithDefaultValue: Story = {
  args: {
    defaultValue: "This is some default text that appears in the textarea.",
    className: "w-[300px]",
    "aria-label": "Textarea with default value",
  },
}

export const WithRows: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Textarea
        placeholder="3 rows"
        rows={3}
        className="w-[300px]"
        aria-label="Textarea with 3 rows"
      />
      <Textarea
        placeholder="6 rows"
        rows={6}
        className="w-[300px]"
        aria-label="Textarea with 6 rows"
      />
      <Textarea
        placeholder="10 rows"
        rows={10}
        className="w-[300px]"
        aria-label="Textarea with 10 rows"
      />
    </div>
  ),
}

export const Invalid: Story = {
  args: {
    placeholder: "Invalid textarea",
    "aria-invalid": true,
    className: "w-[300px]",
    "aria-label": "Invalid textarea",
  },
}
