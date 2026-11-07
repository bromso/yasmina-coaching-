import { BentoCard, BentoGrid } from "@repo/ui/components/bento-grid"
import { Icon } from "@repo/ui/components/icon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Surfaces/BentoGrid",
  component: BentoGrid,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof BentoGrid>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

const PlaceholderBackground = ({ color = "bg-muted" }: { color?: string }) => (
  <div className={`absolute inset-0 ${color} opacity-20`} />
)

const FileTextIcon = (props: Omit<React.ComponentProps<typeof Icon>, "icon">) => (
  <Icon icon="lucide:file-text" {...props} />
)
const BarChartIcon = (props: Omit<React.ComponentProps<typeof Icon>, "icon">) => (
  <Icon icon="lucide:bar-chart-3" {...props} />
)
const SettingsIcon = (props: Omit<React.ComponentProps<typeof Icon>, "icon">) => (
  <Icon icon="lucide:settings" {...props} />
)
const UsersIcon = (props: Omit<React.ComponentProps<typeof Icon>, "icon">) => (
  <Icon icon="lucide:users" {...props} />
)
const ShieldIcon = (props: Omit<React.ComponentProps<typeof Icon>, "icon">) => (
  <Icon icon="lucide:shield" {...props} />
)

const sampleFeatures = [
  {
    Icon: FileTextIcon,
    name: "Document Management",
    description: "Store, organize, and share documents with your team.",
    href: "#",
    cta: "Learn more",
    className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
    background: <PlaceholderBackground />,
  },
  {
    Icon: BarChartIcon,
    name: "Analytics Dashboard",
    description: "Real-time insights and metrics at your fingertips.",
    href: "#",
    cta: "View analytics",
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
    background: <PlaceholderBackground color="bg-blue-500" />,
  },
  {
    Icon: SettingsIcon,
    name: "Custom Workflows",
    description: "Automate repetitive tasks with custom workflows.",
    href: "#",
    cta: "Set up",
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
    background: <PlaceholderBackground color="bg-green-500" />,
  },
  {
    Icon: UsersIcon,
    name: "Team Collaboration",
    description: "Work together seamlessly with real-time collaboration.",
    href: "#",
    cta: "Invite team",
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2",
    background: <PlaceholderBackground color="bg-purple-500" />,
  },
  {
    Icon: ShieldIcon,
    name: "Enterprise Security",
    description: "Bank-grade security with SOC2 compliance built in.",
    href: "#",
    cta: "Learn more",
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4",
    background: <PlaceholderBackground color="bg-amber-500" />,
  },
]

export const Default: Story = {
  render: () => (
    <BentoGrid className="lg:grid-rows-3">
      {sampleFeatures.map((feature) => (
        <BentoCard key={feature.name} {...feature} />
      ))}
    </BentoGrid>
  ),
}

export const TwoColumns: Story = {
  render: () => (
    <BentoGrid className="grid-cols-2">
      {sampleFeatures.slice(0, 4).map((feature) => (
        <BentoCard key={feature.name} {...feature} className="col-span-1" />
      ))}
    </BentoGrid>
  ),
}

export const SingleCard: Story = {
  render: () => (
    <BentoGrid className="max-w-md">
      <BentoCard
        Icon={FileTextIcon}
        name="Document Management"
        description="Store, organize, and share documents with your team in a centralized location."
        href="#"
        cta="Get started"
        className="col-span-3"
        background={<PlaceholderBackground />}
      />
    </BentoGrid>
  ),
}
