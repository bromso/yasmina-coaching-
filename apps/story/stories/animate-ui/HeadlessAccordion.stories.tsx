import {
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
} from "@repo/ui/components/animate-ui/components/headless/accordion"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Headless/Accordion",
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
      <AccordionItem>
        <AccordionButton>What is Headless UI?</AccordionButton>
        <AccordionPanel>
          Headless UI provides completely unstyled, fully accessible UI components, designed to
          integrate with Tailwind CSS.
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem>
        <AccordionButton>How does it differ from Base?</AccordionButton>
        <AccordionPanel>
          The headless variant uses Headless UI primitives (Disclosure) instead of Base UI, offering
          a different API with render props for maximum flexibility.
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem>
        <AccordionButton>Is it animated?</AccordionButton>
        <AccordionPanel>
          Yes. Animate UI wraps the headless primitives with smooth motion transitions for open and
          close states.
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
}

export const WithoutArrow: Story = {
  render: () => (
    <Accordion className="w-[400px]">
      <AccordionItem>
        <AccordionButton showArrow={false}>No arrow indicator</AccordionButton>
        <AccordionPanel>This accordion trigger hides the chevron arrow icon.</AccordionPanel>
      </AccordionItem>
      <AccordionItem>
        <AccordionButton showArrow={false}>Another item</AccordionButton>
        <AccordionPanel>Content for the second item.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
}

export const DefaultOpen: Story = {
  render: () => (
    <Accordion className="w-[400px]">
      <AccordionItem defaultOpen>
        <AccordionButton>Open by default</AccordionButton>
        <AccordionPanel>This accordion item starts in the open state.</AccordionPanel>
      </AccordionItem>
      <AccordionItem>
        <AccordionButton>Closed by default</AccordionButton>
        <AccordionPanel>This item starts closed.</AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
}
