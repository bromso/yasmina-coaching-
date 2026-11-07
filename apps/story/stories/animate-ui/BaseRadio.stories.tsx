import { Radio, RadioGroup } from "@repo/ui/components/animate-ui/components/base/radio"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Base/Radio",
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
    <RadioGroup defaultValue="option-1">
      <div className="flex items-center gap-2">
        <Radio value="option-1" id="base-r1" />
        <label htmlFor="base-r1" className="text-sm">
          Default
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Radio value="option-2" id="base-r2" />
        <label htmlFor="base-r2" className="text-sm">
          Comfortable
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Radio value="option-3" id="base-r3" />
        <label htmlFor="base-r3" className="text-sm">
          Compact
        </label>
      </div>
    </RadioGroup>
  ),
}

export const WithoutDefaultValue: Story = {
  render: () => (
    <RadioGroup>
      <div className="flex items-center gap-2">
        <Radio value="a" id="base-ra" />
        <label htmlFor="base-ra" className="text-sm">
          Option A
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Radio value="b" id="base-rb" />
        <label htmlFor="base-rb" className="text-sm">
          Option B
        </label>
      </div>
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="opt-1" disabled>
      <div className="flex items-center gap-2">
        <Radio value="opt-1" id="base-rd1" />
        <label htmlFor="base-rd1" className="text-sm">
          Selected but disabled
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Radio value="opt-2" id="base-rd2" />
        <label htmlFor="base-rd2" className="text-sm">
          Disabled option
        </label>
      </div>
    </RadioGroup>
  ),
}
