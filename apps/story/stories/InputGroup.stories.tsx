import { Icon } from "@repo/ui/components/icon"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group"
import { Kbd } from "@repo/ui/components/kbd"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/InputGroup",
  component: InputGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InputGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupAddon>
        <Icon icon="lucide:mail" aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Email address" type="email" aria-label="Email address" />
    </InputGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const input = canvas.getByPlaceholderText("Email address")
    await expect(input).toBeInTheDocument()
    await expect(input).toHaveAttribute("type", "email")
  },
}

export const WithText: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="www.example.com" aria-label="Website URL" />
    </InputGroup>
  ),
}

export const WithButton: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupInput placeholder="Search..." aria-label="Search" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>
          <Icon icon="lucide:search" aria-hidden="true" />
          Search
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const WithIconButton: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupInput placeholder="Type to search..." aria-label="Search input" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Clear search">
          <Icon icon="lucide:x" aria-hidden="true" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const WithKbd: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupAddon>
        <Icon icon="lucide:search" aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search..." aria-label="Search" />
      <InputGroupAddon align="inline-end">
        <Kbd>⌘K</Kbd>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const Password: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupAddon>
        <Icon icon="lucide:lock" aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Password" type="password" aria-label="Password" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" variant="ghost" aria-label="Toggle password visibility">
          <Icon icon="lucide:eye" aria-hidden="true" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const Currency: Story = {
  render: () => (
    <InputGroup className="w-[350px]">
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="0.00" type="number" aria-label="Amount in USD" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const WithBothSides: Story = {
  render: () => (
    <InputGroup className="w-[400px]">
      <InputGroupAddon>
        <Icon icon="lucide:globe" aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput placeholder="Enter website URL" aria-label="Website URL" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>
          <Icon icon="lucide:external-link" aria-hidden="true" />
          Visit
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}
