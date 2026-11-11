import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { NativeSelect } from "@repo/ui/components/native-select"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

/** A plain `<select>` that looks like `Input`, for forms that submit without JavaScript. */
const meta = {
  title: "Components/Inputs/NativeSelect",
  component: NativeSelect,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: { disabled: { control: "boolean" } },
} satisfies Meta<typeof NativeSelect>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="status">Status</Label>
      <NativeSelect {...args} id="status" name="status" defaultValue="new">
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="won">Won</option>
      </NativeSelect>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByLabelText("Status")
    await userEvent.selectOptions(select, "won")
    await expect(select).toHaveValue("won")
  },
}

/** Next to an `Input`: the same height, radius and border. */
export const BesideInput: Story = {
  render: () => (
    <div className="flex w-[28rem] items-end gap-2">
      <Input aria-label="Name" placeholder="Name" />
      <NativeSelect aria-label="Role" className="w-auto" defaultValue="member">
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </NativeSelect>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = getComputedStyle(canvas.getByLabelText("Name"))
    const select = getComputedStyle(canvas.getByLabelText("Role"))
    await expect(select.height).toBe(input.height)
    await expect(select.borderTopLeftRadius).toBe(input.borderTopLeftRadius)
  },
}
