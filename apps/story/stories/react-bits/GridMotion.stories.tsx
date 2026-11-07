import GridMotion from "@repo/ui/components/GridMotion"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/GridMotion",
  component: GridMotion,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    items: {
      control: { type: "object" },
      description:
        "Array of strings (text or image URLs) or ReactNode items to display in the grid",
    },
    gradientColor: {
      control: { type: "color" },
      description: "Radial gradient overlay color",
    },
  },
  args: {
    items: [],
    gradientColor: "black",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridMotion>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithImages: Story = {
  args: {
    items: [
      "https://picsum.photos/600/400?random=1",
      "https://picsum.photos/600/400?random=2",
      "Hello",
      "https://picsum.photos/600/400?random=3",
      "World",
      "https://picsum.photos/600/400?random=4",
      "https://picsum.photos/600/400?random=5",
      "React",
      "https://picsum.photos/600/400?random=6",
      "Bits",
      "https://picsum.photos/600/400?random=7",
      "https://picsum.photos/600/400?random=8",
      "Grid",
      "Motion",
      "https://picsum.photos/600/400?random=9",
      "https://picsum.photos/600/400?random=10",
      "Demo",
      "https://picsum.photos/600/400?random=11",
      "https://picsum.photos/600/400?random=12",
      "https://picsum.photos/600/400?random=13",
      "Creative",
      "https://picsum.photos/600/400?random=14",
      "Layout",
      "https://picsum.photos/600/400?random=15",
      "https://picsum.photos/600/400?random=16",
      "Design",
      "https://picsum.photos/600/400?random=17",
      "https://picsum.photos/600/400?random=18",
    ],
    gradientColor: "#1a1a2e",
  },
}
