import { Checkbox } from "@repo/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/field"
import { Input } from "@repo/ui/components/input"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Field",
  component: Field,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["vertical", "horizontal"],
      description: "The layout orientation of the field",
    },
  },
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Field className="w-[350px]">
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" type="email" placeholder="Enter your email" />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const label = canvas.getByText("Email")
    const input = canvas.getByPlaceholderText("Enter your email")

    await expect(label).toBeInTheDocument()
    await expect(input).toBeInTheDocument()
    await expect(input).toHaveAttribute("type", "email")
  },
}

export const WithDescription: Story = {
  render: () => (
    <Field className="w-[350px]">
      <FieldLabel htmlFor="username">Username</FieldLabel>
      <Input id="username" placeholder="Enter your username" />
      <FieldDescription>This will be your public display name.</FieldDescription>
    </Field>
  ),
}

export const WithError: Story = {
  render: () => (
    <Field className="w-[350px]" data-invalid="true">
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <Input id="password" type="password" aria-invalid="true" />
      <FieldError>Password must be at least 8 characters.</FieldError>
    </Field>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <Field orientation="horizontal" className="w-[450px]">
      <FieldLabel htmlFor="name">Full Name</FieldLabel>
      <Input id="name" placeholder="John Doe" className="max-w-[200px]" />
    </Field>
  ),
}

export const WithFieldGroup: Story = {
  render: () => (
    <FieldGroup className="w-[350px]">
      <Field>
        <FieldLabel htmlFor="firstName">First Name</FieldLabel>
        <Input id="firstName" placeholder="John" />
      </Field>
      <Field>
        <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
        <Input id="lastName" placeholder="Doe" />
      </Field>
      <Field>
        <FieldLabel htmlFor="email2">Email</FieldLabel>
        <Input id="email2" type="email" placeholder="john@example.com" />
        <FieldDescription>We'll never share your email.</FieldDescription>
      </Field>
    </FieldGroup>
  ),
}

export const WithFieldSet: Story = {
  render: () => (
    <FieldSet className="w-[350px]">
      <FieldLegend>Personal Information</FieldLegend>
      <FieldDescription>Please fill in your details below.</FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fn">First Name</FieldLabel>
          <Input id="fn" placeholder="John" />
        </Field>
        <Field>
          <FieldLabel htmlFor="ln">Last Name</FieldLabel>
          <Input id="ln" placeholder="Doe" />
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
}

export const WithCheckbox: Story = {
  render: () => (
    <Field orientation="horizontal" className="w-[350px]">
      <Checkbox id="terms" />
      <FieldContent>
        <FieldLabel htmlFor="terms">Accept terms and conditions</FieldLabel>
        <FieldDescription>You agree to our Terms of Service and Privacy Policy.</FieldDescription>
      </FieldContent>
    </Field>
  ),
}
