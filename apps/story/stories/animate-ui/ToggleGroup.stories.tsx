import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components/animate-ui/components/radix/toggle-group"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/ToggleGroup",
  component: ToggleGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToggleGroup>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Single: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="center">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["bold"]}>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Icon icon="lucide:bold" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Icon icon="lucide:italic" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Icon icon="lucide:underline" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const OutlineVariant: Story = {
  render: () => (
    <ToggleGroup type="single" variant="outline" defaultValue="center">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const SmallSize: Story = {
  render: () => (
    <ToggleGroup type="single" size="sm" defaultValue="left">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const LargeSize: Story = {
  render: () => (
    <ToggleGroup type="single" size="lg" defaultValue="left">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <ToggleGroup type="single" disabled defaultValue="center">
      <ToggleGroupItem value="left" aria-label="Align left">
        <Icon icon="lucide:align-left" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <Icon icon="lucide:align-center" className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <Icon icon="lucide:align-right" className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}
