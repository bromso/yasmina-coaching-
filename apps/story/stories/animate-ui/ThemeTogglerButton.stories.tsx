import { ThemeTogglerButton } from "@repo/ui/components/animate-ui/components/buttons/theme-toggler"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { ThemeProvider } from "next-themes"
import type * as React from "react"

function ThemeDecorator({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </ThemeProvider>
  )
}

const meta = {
  title: "Animate UI/Buttons/ThemeTogglerButton",
  component: ThemeTogglerButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ThemeDecorator>
        <Story />
      </ThemeDecorator>
    ),
  ],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "accent", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg"],
    },
    direction: {
      control: "select",
      options: ["ltr", "rtl"],
    },
  },
  args: {
    variant: "default",
    size: "default",
    direction: "ltr",
    modes: ["light", "dark", "system"],
  },
} satisfies Meta<typeof ThemeTogglerButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Outline: Story = {
  args: {
    variant: "outline",
  },
}

export const Ghost: Story = {
  args: {
    variant: "ghost",
  },
}

export const Secondary: Story = {
  args: {
    variant: "secondary",
  },
}

export const LightDarkOnly: Story = {
  args: {
    modes: ["light", "dark"],
  },
}

export const RightToLeft: Story = {
  args: {
    direction: "rtl",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <ThemeTogglerButton variant="default" />
      <ThemeTogglerButton variant="accent" />
      <ThemeTogglerButton variant="destructive" />
      <ThemeTogglerButton variant="outline" />
      <ThemeTogglerButton variant="secondary" />
      <ThemeTogglerButton variant="ghost" />
    </div>
  ),
}
