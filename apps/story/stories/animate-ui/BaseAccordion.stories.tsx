import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@repo/ui/components/animate-ui/components/base/accordion"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Animate UI/Base/Accordion",
  component: Accordion,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Accordion className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionPanel>
          Yes. It adheres to the WAI-ARIA design pattern for accordions.
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionPanel>
          Yes. It comes with default styles that match the other components aesthetic.
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionPanel>
          Yes. It uses smooth animations powered by motion for open and close transitions.
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: /Is it accessible\?/i })
    await userEvent.click(trigger)
    await waitFor(async () =>
      expect(await canvas.findByText(/WAI-ARIA design pattern/i)).toBeVisible()
    )
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"))
    await waitFor(() => expect(canvas.queryByText(/WAI-ARIA design pattern/i)).toBeNull())
  },
}

export const WithoutArrow: Story = {
  render: () => (
    <Accordion className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger showArrow={false}>No arrow indicator</AccordionTrigger>
        <AccordionPanel>
          This accordion trigger does not display the chevron arrow icon.
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger showArrow={false}>Another item without arrow</AccordionTrigger>
        <AccordionPanel>Content for the second item.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
}

export const SingleItem: Story = {
  render: () => (
    <Accordion className="w-[400px]">
      <AccordionItem value="single">
        <AccordionTrigger>Single accordion item</AccordionTrigger>
        <AccordionPanel>This accordion contains only a single collapsible item.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
}

// A caller can refuse a change: the panel must stay closed, in Base UI and in the motion layer.
export const CancelledChange: Story = {
  render: () => (
    <Accordion
      className="w-[400px]"
      onValueChange={(_value, eventDetails) => eventDetails.cancel()}
    >
      <AccordionItem value="locked">
        <AccordionTrigger>Locked section</AccordionTrigger>
        <AccordionPanel>This panel never opens.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Locked section" })
    await userEvent.click(trigger)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByText("This panel never opens.")).toBeNull()
  },
}

// A controlled parent that ignores the change: `value` stays empty, so nothing opens.
export const ControlledRefusal: Story = {
  render: () => (
    <Accordion className="w-[400px]" value={[]} onValueChange={() => {}}>
      <AccordionItem value="frozen">
        <AccordionTrigger>Frozen section</AccordionTrigger>
        <AccordionPanel>This panel stays closed.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Frozen section" })
    await userEvent.click(trigger)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByText("This panel stays closed.")).toBeNull()
  },
}

// A controlled parent that accepts the change: the panel opens through `value` alone.
export const Controlled: Story = {
  render: function Controlled() {
    const [value, setValue] = React.useState<string[]>([])
    return (
      <Accordion className="w-[400px]" value={value} onValueChange={setValue}>
        <AccordionItem value="open-me">
          <AccordionTrigger>Controlled section</AccordionTrigger>
          <AccordionPanel>Opened by the parent.</AccordionPanel>
        </AccordionItem>
      </Accordion>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Controlled section" })
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await waitFor(async () =>
      expect(await canvas.findByText("Opened by the parent.")).toBeVisible()
    )
  },
}
