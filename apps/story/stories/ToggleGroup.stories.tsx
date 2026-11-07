import { Icon } from "@repo/ui/components/icon"
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/ToggleGroup",
  component: ToggleGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["single", "multiple"],
      description: "Whether a single or multiple items can be selected",
    },
    variant: {
      control: "select",
      options: ["default", "outline"],
      description: "The visual style variant",
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
      description: "The size of the toggle items",
    },
    disabled: {
      control: "boolean",
      description: "Whether the toggle group is disabled",
    },
  },
} satisfies Meta<typeof ToggleGroup>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <ToggleGroup type="single">
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Icon icon="lucide:underline" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const boldToggle = canvas.getByRole("radio", { name: /toggle bold/i })
    const italicToggle = canvas.getByRole("radio", { name: /toggle italic/i })

    await expect(boldToggle).not.toBeChecked()

    await userEvent.click(boldToggle)
    await expect(boldToggle).toBeChecked()

    await userEvent.click(italicToggle)
    await expect(italicToggle).toBeChecked()
    await expect(boldToggle).not.toBeChecked()
  },
}

export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple">
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Icon icon="lucide:underline" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const boldToggle = canvas.getByRole("button", { name: /toggle bold/i })
    const italicToggle = canvas.getByRole("button", { name: /toggle italic/i })

    await userEvent.click(boldToggle)
    await expect(boldToggle).toHaveAttribute("aria-pressed", "true")

    await userEvent.click(italicToggle)
    await expect(italicToggle).toHaveAttribute("aria-pressed", "true")
    await expect(boldToggle).toHaveAttribute("aria-pressed", "true")
  },
}

export const Outline: Story = {
  render: () => (
    <ToggleGroup type="single" variant="outline">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ToggleGroup type="single" size="sm">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
        <ToggleGroupItem value="c">C</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" size="default">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
        <ToggleGroupItem value="c">C</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" size="lg">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
        <ToggleGroupItem value="c">C</ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
}

export const WithText: Story = {
  render: () => (
    <ToggleGroup type="single">
      <ToggleGroupItem value="list" aria-label="List view">
        <Icon icon="lucide:list" className="mr-2 size-4" aria-hidden="true" />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Icon icon="lucide:grid" className="mr-2 size-4" aria-hidden="true" />
        Grid
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <ToggleGroup type="single" disabled>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Icon icon="lucide:underline" className="size-4" aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}
