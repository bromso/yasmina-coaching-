import { Toggle, ToggleGroup } from "@repo/ui/components/animate-ui/components/base/toggle-group"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"

const meta = {
  title: "Animate UI/Base/Toggle Group",
  component: ToggleGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToggleGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ToggleGroup defaultValue={["center"]}>
      <Toggle value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </Toggle>
      <Toggle value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </Toggle>
      <Toggle value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </Toggle>
    </ToggleGroup>
  ),
  // The pressed item takes the accent colour (`data-[pressed]`; Base UI sets `data-pressed=""`).
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pressed = canvas.getByRole("button", { name: "Align center" })
    const unpressed = canvas.getByRole("button", { name: "Align left" })
    await expect(pressed).toHaveAttribute("data-pressed")
    await expect(unpressed).not.toHaveAttribute("data-pressed")
    await waitFor(() =>
      expect(getComputedStyle(pressed).color).not.toBe(getComputedStyle(unpressed).color)
    )
  },
}

export const OutlineVariant: Story = {
  render: () => (
    <ToggleGroup variant="outline" defaultValue={["left"]}>
      <Toggle value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </Toggle>
      <Toggle value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </Toggle>
      <Toggle value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </Toggle>
    </ToggleGroup>
  ),
}

export const Multiple: Story = {
  render: () => (
    <ToggleGroup multiple defaultValue={["bold"]}>
      <Toggle value="bold" aria-label="Bold">
        <Icon icon="lucide:bold" className="size-4" />
      </Toggle>
      <Toggle value="italic" aria-label="Italic">
        <Icon icon="lucide:italic" className="size-4" />
      </Toggle>
      <Toggle value="underline" aria-label="Underline">
        <Icon icon="lucide:underline" className="size-4" />
      </Toggle>
    </ToggleGroup>
  ),
}

export const SmallSize: Story = {
  render: () => (
    <ToggleGroup size="sm" defaultValue={["center"]}>
      <Toggle value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </Toggle>
      <Toggle value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </Toggle>
      <Toggle value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </Toggle>
    </ToggleGroup>
  ),
}

export const LargeSize: Story = {
  render: () => (
    <ToggleGroup size="lg" defaultValue={["center"]}>
      <Toggle value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </Toggle>
      <Toggle value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </Toggle>
      <Toggle value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </Toggle>
    </ToggleGroup>
  ),
}
