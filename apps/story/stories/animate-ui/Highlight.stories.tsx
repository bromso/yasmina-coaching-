import {
  Highlight,
  HighlightItem,
} from "@repo/ui/components/animate-ui/primitives/effects/highlight"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Effects/Highlight",
  component: Highlight,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    mode: {
      control: "select",
      options: ["children", "parent"],
    },
    hover: {
      control: "boolean",
    },
    click: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
    enabled: {
      control: "boolean",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    hover: false,
    click: true,
    disabled: false,
    enabled: true,
  },
} satisfies Meta<typeof Highlight>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Highlight
      {...args}
      className="rounded-md bg-primary/20 inset-0"
      style={{ inset: 0, borderRadius: "0.375rem" }}
    >
      <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Option A</div>
      <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Option B</div>
      <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Option C</div>
    </Highlight>
  ),
}

export const HoverMode: Story = {
  render: (args) => (
    <div className="flex gap-2">
      <Highlight
        {...args}
        className="rounded-md bg-muted inset-0"
        style={{ inset: 0, borderRadius: "0.375rem" }}
      >
        <div className="rounded-md px-4 py-2 text-sm cursor-pointer">Home</div>
        <div className="rounded-md px-4 py-2 text-sm cursor-pointer">About</div>
        <div className="rounded-md px-4 py-2 text-sm cursor-pointer">Contact</div>
      </Highlight>
    </div>
  ),
  args: {
    hover: true,
    click: false,
  },
}

export const ParentMode: Story = {
  render: (args) => (
    <Highlight
      {...args}
      mode="parent"
      controlledItems
      className="rounded-md bg-primary/20"
      style={{ borderRadius: "0.375rem" }}
      containerClassName="flex gap-2"
    >
      <HighlightItem value="a">
        <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Tab A</div>
      </HighlightItem>
      <HighlightItem value="b">
        <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Tab B</div>
      </HighlightItem>
      <HighlightItem value="c">
        <div className="rounded-md border px-4 py-2 text-sm cursor-pointer">Tab C</div>
      </HighlightItem>
    </Highlight>
  ),
  args: {
    hover: true,
    click: false,
  },
}
