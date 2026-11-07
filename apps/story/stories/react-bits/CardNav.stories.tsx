import CardNav from "@repo/ui/components/CardNav"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleItems = [
  {
    label: "Products",
    bgColor: "#5227FF",
    textColor: "#fff",
    links: [
      { label: "Analytics", href: "#", ariaLabel: "Analytics" },
      { label: "Automation", href: "#", ariaLabel: "Automation" },
      { label: "Integrations", href: "#", ariaLabel: "Integrations" },
    ],
  },
  {
    label: "Resources",
    bgColor: "#10B981",
    textColor: "#fff",
    links: [
      { label: "Documentation", href: "#", ariaLabel: "Documentation" },
      { label: "Blog", href: "#", ariaLabel: "Blog" },
    ],
  },
  {
    label: "Company",
    bgColor: "#F59E0B",
    textColor: "#fff",
    links: [
      { label: "About", href: "#", ariaLabel: "About" },
      { label: "Careers", href: "#", ariaLabel: "Careers" },
      { label: "Contact", href: "#", ariaLabel: "Contact" },
    ],
  },
]

const meta = {
  title: "React Bits/Components/CardNav",
  component: CardNav,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    logo: {
      control: { type: "text" },
      description: "URL of the logo image",
    },
    logoAlt: {
      control: { type: "text" },
      description: "Alt text for the logo",
    },
    ease: {
      control: { type: "text" },
      description: "GSAP easing function for the expand animation",
    },
    baseColor: {
      control: { type: "color" },
      description: "Background color of the nav bar",
    },
    menuColor: {
      control: { type: "color" },
      description: "Color of the hamburger menu icon",
    },
    buttonBgColor: {
      control: { type: "color" },
      description: "Background color of the CTA button",
    },
    buttonTextColor: {
      control: { type: "color" },
      description: "Text color of the CTA button",
    },
  },
  args: {
    logo: "https://picsum.photos/seed/logo/120/28",
    logoAlt: "Logo",
    items: sampleItems,
    ease: "power3.out",
    baseColor: "#fff",
    menuColor: "#000",
    buttonBgColor: "#5227FF",
    buttonTextColor: "#fff",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "900px", height: "400px", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CardNav>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DarkTheme: Story = {
  args: {
    baseColor: "#1a1a2e",
    menuColor: "#ffffff",
    buttonBgColor: "#e94560",
    buttonTextColor: "#ffffff",
  },
}
