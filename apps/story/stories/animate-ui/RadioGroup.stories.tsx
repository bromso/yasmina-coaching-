import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/ui/components/animate-ui/components/radix/radio-group"
import { Label } from "@repo/ui/components/label"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">Default</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">Comfortable</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">Compact</Label>
      </div>
    </RadioGroup>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1" className="flex flex-row gap-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-1" id="h1" />
        <Label htmlFor="h1">Option 1</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-2" id="h2" />
        <Label htmlFor="h2">Option 2</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-3" id="h3" />
        <Label htmlFor="h3">Option 3</Label>
      </div>
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-1" disabled>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-1" id="d1" />
        <Label htmlFor="d1">Disabled selected</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-2" id="d2" />
        <Label htmlFor="d2">Disabled unselected</Label>
      </div>
    </RadioGroup>
  ),
}
