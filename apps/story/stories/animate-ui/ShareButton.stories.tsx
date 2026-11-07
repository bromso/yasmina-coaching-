import { ShareButton } from "@repo/ui/components/animate-ui/components/community/share-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Community/ShareButton",
  component: ShareButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["default", "sm", "md", "lg"],
    },
    icon: {
      control: "select",
      options: [undefined, "prefix", "suffix"],
    },
  },
  args: {
    children: "Share",
    size: "default",
  },
} satisfies Meta<typeof ShareButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithPrefixIcon: Story = {
  args: {
    icon: "prefix",
  },
}

export const WithSuffixIcon: Story = {
  args: {
    icon: "suffix",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    children: "Share",
  },
}

export const Medium: Story = {
  args: {
    size: "md",
    children: "Share this",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    children: "Share with friends",
    icon: "prefix",
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <ShareButton size="sm">Small</ShareButton>
      <ShareButton size="default">Default</ShareButton>
      <ShareButton size="md">Medium</ShareButton>
      <ShareButton size="lg">Large</ShareButton>
    </div>
  ),
}

export const WithIconVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <ShareButton>No icon</ShareButton>
      <ShareButton icon="prefix">Prefix</ShareButton>
      <ShareButton icon="suffix">Suffix</ShareButton>
    </div>
  ),
}
