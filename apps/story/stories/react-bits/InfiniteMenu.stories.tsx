import InfiniteMenu from "@repo/ui/components/InfiniteMenu"
import type { Meta, StoryObj } from "@storybook/react-vite"

const menuItems = [
  {
    image: "https://picsum.photos/seed/menu1/900/900",
    link: "#",
    title: "Nature",
    description: "Explore the wilderness",
  },
  {
    image: "https://picsum.photos/seed/menu2/900/900",
    link: "#",
    title: "Architecture",
    description: "Modern design spaces",
  },
  {
    image: "https://picsum.photos/seed/menu3/900/900",
    link: "#",
    title: "Abstract",
    description: "Creative compositions",
  },
  {
    image: "https://picsum.photos/seed/menu4/900/900",
    link: "#",
    title: "Travel",
    description: "Discover new places",
  },
  {
    image: "https://picsum.photos/seed/menu5/900/900",
    link: "#",
    title: "Portrait",
    description: "Human expressions",
  },
  {
    image: "https://picsum.photos/seed/menu6/900/900",
    link: "#",
    title: "Urban",
    description: "City life captured",
  },
]

const meta = {
  title: "React Bits/Components/InfiniteMenu",
  component: InfiniteMenu,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    scale: {
      control: { type: "range", min: 0.5, max: 2, step: 0.1 },
      description: "Scale of the 3D sphere",
    },
  },
  args: {
    items: menuItems,
    scale: 1.0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#060010", color: "white" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InfiniteMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LargeScale: Story = {
  args: {
    scale: 1.5,
  },
}
