import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/animate-ui/components/radix/accordion"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Accordion",
  component: Accordion,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Accordion>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that match the other components.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It uses Animate UI primitives for smooth open/close animations.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>First section</AccordionTrigger>
        <AccordionContent>
          Content for the first section. Multiple items can be open at once.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Second section</AccordionTrigger>
        <AccordionContent>Content for the second section.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Third section</AccordionTrigger>
        <AccordionContent>Content for the third section.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const WithoutArrow: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger showArrow={false}>No arrow indicator</AccordionTrigger>
        <AccordionContent>This trigger does not show the chevron arrow icon.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger showArrow={false}>Also no arrow</AccordionTrigger>
        <AccordionContent>Another item without the arrow indicator.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const DefaultOpen: Story = {
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-2" className="w-[400px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>First item</AccordionTrigger>
        <AccordionContent>This item is closed by default.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Second item (default open)</AccordionTrigger>
        <AccordionContent>This item is open by default via the defaultValue prop.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}
