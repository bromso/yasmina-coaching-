import { Dock, DockIcon } from "@repo/ui/components/dock"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Navigation/Dock",
  component: Dock,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    iconSize: {
      control: { type: "number", min: 20, max: 80, step: 4 },
      description: "Base size of the dock icons in pixels",
    },
    iconMagnification: {
      control: { type: "number", min: 20, max: 120, step: 4 },
      description: "Magnified size of icons on hover",
    },
    iconDistance: {
      control: { type: "number", min: 50, max: 300, step: 10 },
      description: "Distance in pixels at which magnification starts",
    },
    disableMagnification: {
      control: "boolean",
      description: "Disable the magnification effect on hover",
    },
    direction: {
      control: "select",
      options: ["top", "middle", "bottom"],
      description: "Vertical alignment of icons within the dock",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
  },
} satisfies Meta<typeof Dock>

export default meta
type Story = StoryObj<typeof meta>

const icons = [
  { name: "lucide:home", label: "Home" },
  { name: "lucide:search", label: "Search" },
  { name: "lucide:mail", label: "Mail" },
  { name: "lucide:calendar", label: "Calendar" },
  { name: "lucide:settings", label: "Settings" },
]

export const Default: Story = {
  render: (args) => (
    <Dock {...args}>
      {icons.map((icon) => (
        <DockIcon key={icon.label}>
          <Icon icon={icon.name} className="size-full" />
        </DockIcon>
      ))}
    </Dock>
  ),
}

export const LargeIcons: Story = {
  render: (args) => (
    <Dock {...args}>
      {icons.map((icon) => (
        <DockIcon key={icon.label}>
          <Icon icon={icon.name} className="size-full" />
        </DockIcon>
      ))}
    </Dock>
  ),
  args: {
    iconSize: 56,
    iconMagnification: 80,
  },
}

export const NoMagnification: Story = {
  render: (args) => (
    <Dock {...args}>
      {icons.map((icon) => (
        <DockIcon key={icon.label}>
          <Icon icon={icon.name} className="size-full" />
        </DockIcon>
      ))}
    </Dock>
  ),
  args: {
    disableMagnification: true,
  },
}

export const DirectionTop: Story = {
  render: (args) => (
    <Dock {...args}>
      {icons.map((icon) => (
        <DockIcon key={icon.label}>
          <Icon icon={icon.name} className="size-full" />
        </DockIcon>
      ))}
    </Dock>
  ),
  args: {
    direction: "top",
  },
}

export const DirectionBottom: Story = {
  render: (args) => (
    <Dock {...args}>
      {icons.map((icon) => (
        <DockIcon key={icon.label}>
          <Icon icon={icon.name} className="size-full" />
        </DockIcon>
      ))}
    </Dock>
  ),
  args: {
    direction: "bottom",
  },
}
