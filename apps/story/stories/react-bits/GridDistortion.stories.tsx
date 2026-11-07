import GridDistortion from "@repo/ui/components/GridDistortion"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/GridDistortion",
  component: GridDistortion,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    imageSrc: { control: { type: "text" }, description: "URL of the image to distort" },
    grid: {
      control: { type: "range", min: 5, max: 50, step: 1 },
      description: "Grid resolution for distortion",
    },
    mouse: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Mouse influence radius",
    },
    strength: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Distortion strength",
    },
    relaxation: {
      control: { type: "range", min: 0.5, max: 1, step: 0.01 },
      description: "How quickly the distortion relaxes back",
    },
  },
  args: {
    imageSrc: "https://picsum.photos/1920/1080?random=1",
    grid: 15,
    mouse: 0.1,
    strength: 0.15,
    relaxation: 0.9,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GridDistortion>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const StrongDistortion: Story = {
  args: {
    imageSrc: "https://picsum.photos/1920/1080?random=2",
    grid: 30,
    mouse: 0.2,
    strength: 0.4,
    relaxation: 0.85,
  },
}
