import { Icon } from "@repo/ui/components/icon"
import { Toggle } from "@repo/ui/components/toggle"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Toggle",
  component: Toggle,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Toggle>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />,
    "aria-label": "Toggle bold",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: /toggle bold/i })

    await expect(toggle).toBeInTheDocument()
    await expect(toggle).toHaveAttribute("aria-pressed", "false")

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-pressed", "true")

    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
  },
}

export const Outline: Story = {
  args: {
    variant: "outline",
    children: <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />,
    "aria-label": "Toggle italic",
  },
}

export const WithText: Story = {
  args: {
    children: (
      <>
        <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />
        Italic
      </>
    ),
    "aria-label": "Toggle italic",
  },
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Toggle size="sm" aria-label="Toggle small">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </Toggle>
      <Toggle size="default" aria-label="Toggle default">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </Toggle>
      <Toggle size="lg" aria-label="Toggle large">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </Toggle>
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: <Icon icon="lucide:underline" className="size-4" aria-hidden="true" />,
    "aria-label": "Toggle underline",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole("button", { name: /toggle underline/i })

    await expect(toggle).toBeDisabled()
  },
}

export const TextFormatting: Story = {
  render: () => (
    <div className="flex items-center gap-1">
      <Toggle aria-label="Toggle bold">
        <Icon icon="lucide:bold" className="size-4" aria-hidden="true" />
      </Toggle>
      <Toggle aria-label="Toggle italic">
        <Icon icon="lucide:italic" className="size-4" aria-hidden="true" />
      </Toggle>
      <Toggle aria-label="Toggle underline">
        <Icon icon="lucide:underline" className="size-4" aria-hidden="true" />
      </Toggle>
      <Toggle aria-label="Toggle strikethrough">
        <Icon icon="lucide:strikethrough" className="size-4" aria-hidden="true" />
      </Toggle>
    </div>
  ),
}
