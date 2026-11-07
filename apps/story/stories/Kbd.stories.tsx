import { Icon } from "@repo/ui/components/icon"
import { Kbd, KbdGroup } from "@repo/ui/components/kbd"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Kbd",
  component: Kbd,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Kbd>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <Kbd>⌘</Kbd>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const kbd = canvas.getByText("⌘")
    await expect(kbd).toBeInTheDocument()
  },
}

export const WithText: Story = {
  render: () => <Kbd>Ctrl</Kbd>,
}

export const KeyCombination: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
}

export const CommonShortcuts: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-sm w-20">Copy:</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>C</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-20">Paste:</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>V</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-20">Save:</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>S</Kbd>
        </KbdGroup>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-20">Find:</span>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>F</Kbd>
        </KbdGroup>
      </div>
    </div>
  ),
}

export const ComplexShortcut: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
    </KbdGroup>
  ),
}

export const WithIcon: Story = {
  render: () => (
    <Kbd>
      <Icon icon="lucide:arrow-up" className="size-3" aria-hidden="true" />
      <span className="sr-only">Up arrow</span>
    </Kbd>
  ),
}

export const ArrowKeys: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-1">
      <Kbd>
        <Icon icon="lucide:arrow-up" className="size-3" aria-hidden="true" />
        <span className="sr-only">Up arrow</span>
      </Kbd>
      <div className="flex gap-1">
        <Kbd>
          <Icon icon="lucide:arrow-left" className="size-3" aria-hidden="true" />
          <span className="sr-only">Left arrow</span>
        </Kbd>
        <Kbd>
          <Icon icon="lucide:arrow-down" className="size-3" aria-hidden="true" />
          <span className="sr-only">Down arrow</span>
        </Kbd>
        <Kbd>
          <Icon icon="lucide:arrow-right" className="size-3" aria-hidden="true" />
          <span className="sr-only">Right arrow</span>
        </Kbd>
      </div>
    </div>
  ),
}

export const SpecialKeys: Story = {
  render: () => (
    <div className="flex gap-2">
      <Kbd>Esc</Kbd>
      <Kbd>Tab</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Space</Kbd>
    </div>
  ),
}
