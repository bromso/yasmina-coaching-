import { Button } from "@repo/ui/components/button"
import { CoolMode } from "@repo/ui/components/cool-mode"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Effects/CoolMode",
  component: CoolMode,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof CoolMode>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <CoolMode>
      <Button>Click and drag me</Button>
    </CoolMode>
  ),
}

export const WithEmoji: Story = {
  render: () => (
    <CoolMode options={{ particle: "🎉" }}>
      <Button variant="outline">Party mode</Button>
    </CoolMode>
  ),
}

export const CustomParticleCount: Story = {
  render: () => (
    <CoolMode options={{ particleCount: 10, speedUp: 15 }}>
      <Button variant="secondary">Subtle particles</Button>
    </CoolMode>
  ),
}

export const CustomSize: Story = {
  render: () => (
    <CoolMode options={{ size: 40 }}>
      <Button variant="destructive">Large particles</Button>
    </CoolMode>
  ),
}
