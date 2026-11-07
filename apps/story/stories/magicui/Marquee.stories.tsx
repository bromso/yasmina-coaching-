import { Marquee } from "@repo/ui/components/magicui/marquee"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Layout/Marquee",
  component: Marquee,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    reverse: {
      control: "boolean",
      description: "Whether to reverse the animation direction",
    },
    pauseOnHover: {
      control: "boolean",
      description: "Whether to pause the animation on hover",
    },
    vertical: {
      control: "boolean",
      description: "Whether to animate vertically instead of horizontally",
    },
    repeat: {
      control: { type: "number", min: 1, max: 10 },
      description: "Number of times to repeat the content",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    reverse: false,
    pauseOnHover: false,
    vertical: false,
    repeat: 4,
  },
} satisfies Meta<typeof Marquee>

export default meta
type Story = StoryObj<typeof meta>

const MarqueeCard = ({ label }: { label: string }) => (
  <div className="flex h-20 w-40 items-center justify-center rounded-lg border bg-card px-4 text-sm font-medium text-card-foreground shadow-sm">
    {label}
  </div>
)

const items = ["React", "TypeScript", "Tailwind", "Next.js", "Storybook", "Radix"]

export const Default: Story = {
  render: (args) => (
    <Marquee {...args}>
      {items.map((item) => (
        <MarqueeCard key={item} label={item} />
      ))}
    </Marquee>
  ),
}

export const Reversed: Story = {
  args: {
    reverse: true,
  },
  render: (args) => (
    <Marquee {...args}>
      {items.map((item) => (
        <MarqueeCard key={item} label={item} />
      ))}
    </Marquee>
  ),
}

export const PauseOnHover: Story = {
  args: {
    pauseOnHover: true,
  },
  render: (args) => (
    <Marquee {...args}>
      {items.map((item) => (
        <MarqueeCard key={item} label={item} />
      ))}
    </Marquee>
  ),
}

export const Vertical: Story = {
  args: {
    vertical: true,
  },
  render: (args) => (
    <div className="h-[400px] overflow-hidden">
      <Marquee {...args}>
        {items.map((item) => (
          <MarqueeCard key={item} label={item} />
        ))}
      </Marquee>
    </div>
  ),
}

export const DoubleRow: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Marquee>
        {items.map((item) => (
          <MarqueeCard key={item} label={item} />
        ))}
      </Marquee>
      <Marquee reverse>
        {items.map((item) => (
          <MarqueeCard key={item} label={item} />
        ))}
      </Marquee>
    </div>
  ),
}
