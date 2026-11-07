import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search", "tel", "url"],
    },
    disabled: {
      control: "boolean",
    },
    placeholder: {
      control: "text",
    },
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: "Enter text...",
    type: "text",
    "aria-label": "Text input",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole("textbox")

    await expect(input).toBeInTheDocument()
    await expect(input).toHaveAttribute("placeholder", "Enter text...")

    await userEvent.type(input, "Hello World")
    await expect(input).toHaveValue("Hello World")
  },
}

export const Email: Story = {
  args: {
    type: "email",
    placeholder: "email@example.com",
    "aria-label": "Email input",
  },
}

export const Password: Story = {
  args: {
    type: "password",
    placeholder: "Enter password",
    "aria-label": "Password input",
  },
}

export const Search: Story = {
  args: {
    type: "search",
    placeholder: "Search...",
    "aria-label": "Search input",
  },
}

export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    disabled: true,
    "aria-label": "Disabled input",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole("textbox")

    await expect(input).toBeDisabled()
  },
}

export const WithValue: Story = {
  args: {
    defaultValue: "Hello World",
    "aria-label": "Input with default value",
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText("Email")

    await expect(input).toBeInTheDocument()
    await userEvent.type(input, "test@example.com")
    await expect(input).toHaveValue("test@example.com")
  },
}

export const File: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="picture">Picture</Label>
      <Input id="picture" type="file" />
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="invalid-email">Email</Label>
      <Input
        type="email"
        id="invalid-email"
        placeholder="Email"
        aria-invalid="true"
        defaultValue="invalid-email"
      />
      <p className="text-sm text-destructive">Please enter a valid email address.</p>
    </div>
  ),
}
