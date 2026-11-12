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
  // The pressed item is marked by the accent highlight drawn behind it (Base UI sets
  // `data-pressed=""`). Its text keeps the foreground colour, so the check is the highlight.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const pressed = canvas.getByRole("button", { name: "Align center" })
    const unpressed = canvas.getByRole("button", { name: "Align left" })
    await expect(pressed).toHaveAttribute("data-pressed")
    await expect(unpressed).not.toHaveAttribute("data-pressed")
    await waitFor(() => {
      const highlight = canvasElement.querySelector<HTMLElement>('[data-slot="motion-highlight"]')
      expect(highlight).not.toBeNull()
      const box = highlight?.getBoundingClientRect()
      const target = pressed.getBoundingClientRect()
      expect(getComputedStyle(highlight as HTMLElement).backgroundColor).not.toBe(
        "rgba(0, 0, 0, 0)"
      )
      expect(Math.abs((box?.left ?? 0) - target.left)).toBeLessThan(2)
      expect(Math.abs((box?.width ?? 0) - target.width)).toBeLessThan(2)
    })
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
