import { AutoHeight } from "@repo/ui/components/animate-ui/primitives/effects/auto-height"
import type { Meta, StoryObj } from "@storybook/react-vite"
import React from "react"

const meta = {
  title: "Animate UI/Effects/AutoHeight",
  component: AutoHeight,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AutoHeight>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [expanded, setExpanded] = React.useState(false)

    return (
      <div className="w-80">
        <button
          type="button"
          className="mb-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show Less" : "Show More"}
        </button>
        <AutoHeight deps={[expanded]} className="rounded-lg border bg-card shadow-sm">
          <div className="p-4">
            <p className="text-sm text-card-foreground">This content is always visible.</p>
            {expanded && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  This additional content is revealed with a smooth height animation.
                </p>
                <p className="text-sm text-muted-foreground">
                  The AutoHeight component automatically measures its content and animates the
                  height when dependencies change.
                </p>
                <p className="text-sm text-muted-foreground">
                  It uses a spring-based transition for a natural feel.
                </p>
              </div>
            )}
          </div>
        </AutoHeight>
      </div>
    )
  },
}

export const AccordionStyle: Story = {
  render: () => {
    const [openIndex, setOpenIndex] = React.useState<number | null>(null)
    const items = [
      { title: "Section 1", content: "Content for the first section." },
      {
        title: "Section 2",
        content:
          "Content for the second section, which is a bit longer to demonstrate dynamic height.",
      },
      { title: "Section 3", content: "Short content." },
    ]

    return (
      <div className="w-80 space-y-2">
        {items.map((item, index) => (
          <div key={item.title} className="rounded-lg border bg-card shadow-sm">
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm font-medium"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              {item.title}
            </button>
            <AutoHeight deps={[openIndex]}>
              {openIndex === index && (
                <div className="px-4 pb-3">
                  <p className="text-sm text-muted-foreground">{item.content}</p>
                </div>
              )}
            </AutoHeight>
          </div>
        ))}
      </div>
    )
  },
}
