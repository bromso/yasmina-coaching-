import { Button } from "@repo/ui/components/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@repo/ui/components/button-group"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/ButtonGroup",
  component: ButtonGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
      description: "The orientation of the button group",
    },
  },
} satisfies Meta<typeof ButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Left</Button>
      <Button variant="outline">Center</Button>
      <Button variant="outline">Right</Button>
    </ButtonGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const leftButton = canvas.getByRole("button", { name: /left/i })
    const centerButton = canvas.getByRole("button", { name: /center/i })
    const rightButton = canvas.getByRole("button", { name: /right/i })

    await expect(leftButton).toBeInTheDocument()
    await expect(centerButton).toBeInTheDocument()
    await expect(rightButton).toBeInTheDocument()
  },
}

export const WithIcons: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon" aria-label="Justify">
        <Icon icon="lucide:align-justify" className="size-4" aria-hidden="true" />
      </Button>
    </ButtonGroup>
  ),
}

export const Vertical: Story = {
  render: () => (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Top</Button>
      <Button variant="outline">Middle</Button>
      <Button variant="outline">Bottom</Button>
    </ButtonGroup>
  ),
}

export const WithText: Story = {
  render: () => (
    <ButtonGroup>
      <ButtonGroupText>https://</ButtonGroupText>
      <Button variant="outline">example.com</Button>
    </ButtonGroup>
  ),
}

export const WithSeparator: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Save</Button>
      <ButtonGroupSeparator />
      <Button variant="outline" size="icon" aria-label="More options">
        <Icon icon="lucide:chevron-down" className="size-4" aria-hidden="true" />
      </Button>
    </ButtonGroup>
  ),
}

export const Mixed: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">
        <Icon icon="lucide:bold" className="mr-2 size-4" aria-hidden="true" />
        Bold
      </Button>
      <Button variant="outline">
        <Icon icon="lucide:italic" className="mr-2 size-4" aria-hidden="true" />
        Italic
      </Button>
      <Button variant="outline">
        <Icon icon="lucide:underline" className="mr-2 size-4" aria-hidden="true" />
        Underline
      </Button>
    </ButtonGroup>
  ),
}
