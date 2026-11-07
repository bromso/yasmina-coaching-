import { Label } from "@repo/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
      description: "Whether the radio group is disabled",
    },
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
      description: "The orientation of the radio group",
    },
    loop: {
      control: "boolean",
      description: "Whether keyboard navigation should loop",
    },
  },
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="option-one" />
        <Label htmlFor="option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="option-two" />
        <Label htmlFor="option-two">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="option-three" />
        <Label htmlFor="option-three">Option Three</Label>
      </div>
    </RadioGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const radioOne = canvas.getByRole("radio", { name: /option one/i })
    const radioTwo = canvas.getByRole("radio", { name: /option two/i })

    await expect(radioOne).toBeChecked()
    await expect(radioTwo).not.toBeChecked()

    await userEvent.click(radioTwo)
    await expect(radioTwo).toBeChecked()
    await expect(radioOne).not.toBeChecked()
  },
}

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one" className="flex gap-4">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="h-option-one" />
        <Label htmlFor="h-option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="h-option-two" />
        <Label htmlFor="h-option-two">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="h-option-three" />
        <Label htmlFor="h-option-three">Option Three</Label>
      </div>
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="d-option-one" />
        <Label htmlFor="d-option-one">Available</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="d-option-two" disabled />
        <Label htmlFor="d-option-two" className="opacity-50">
          Disabled
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="d-option-three" />
        <Label htmlFor="d-option-three">Available</Label>
      </div>
    </RadioGroup>
  ),
}

export const WithDescriptions: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="default" id="r1" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="r1">Default</Label>
          <p className="text-muted-foreground text-sm">The default spacing settings.</p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="comfortable" id="r2" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="r2">Comfortable</Label>
          <p className="text-muted-foreground text-sm">More breathing room between elements.</p>
        </div>
      </div>
      <div className="flex items-start space-x-2">
        <RadioGroupItem value="compact" id="r3" className="mt-1" />
        <div className="grid gap-1">
          <Label htmlFor="r3">Compact</Label>
          <p className="text-muted-foreground text-sm">Reduced spacing for dense layouts.</p>
        </div>
      </div>
    </RadioGroup>
  ),
}
