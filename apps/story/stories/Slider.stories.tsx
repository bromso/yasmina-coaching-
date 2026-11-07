import { Slider } from "@repo/ui/components/slider"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    max: {
      control: { type: "number", min: 1, max: 1000 },
      description: "The maximum value of the slider",
    },
    min: {
      control: { type: "number", min: 0, max: 100 },
      description: "The minimum value of the slider",
    },
    step: {
      control: { type: "number", min: 1, max: 100 },
      description: "The step increment value",
    },
    disabled: {
      control: "boolean",
      description: "Whether the slider is disabled",
    },
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
      description: "The orientation of the slider",
    },
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
    className: "w-[300px]",
    "aria-label": "Volume",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slider = canvas.getByRole("slider")

    await expect(slider).toBeInTheDocument()
    await expect(slider).toHaveAttribute("aria-valuenow", "50")
  },
}

export const Range: Story = {
  args: {
    defaultValue: [25, 75],
    max: 100,
    step: 1,
    className: "w-[300px]",
    "aria-label": "Price range",
  },
}

export const WithSteps: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 10,
    className: "w-[300px]",
    "aria-label": "Volume with steps",
  },
}

export const Disabled: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    disabled: true,
    className: "w-[300px]",
    "aria-label": "Volume (disabled)",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const slider = canvas.getByRole("slider")

    await expect(slider).toHaveAttribute("data-disabled", "")
  },
}

export const Vertical: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    orientation: "vertical",
    className: "h-[200px]",
    "aria-label": "Vertical slider",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-[300px] flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Single Value</p>
        <Slider defaultValue={[33]} max={100} step={1} aria-label="Single value slider" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Range</p>
        <Slider defaultValue={[25, 75]} max={100} step={1} aria-label="Range slider" />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Disabled</p>
        <Slider defaultValue={[50]} max={100} disabled aria-label="Disabled slider" />
      </div>
    </div>
  ),
}
