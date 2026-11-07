import GlareHover from "@repo/ui/components/GlareHover"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/GlareHover",
  component: GlareHover,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "text" },
      description: "Width of the card",
    },
    height: {
      control: { type: "text" },
      description: "Height of the card",
    },
    background: {
      control: { type: "color" },
      description: "Background color of the card",
    },
    borderRadius: {
      control: { type: "text" },
      description: "Border radius of the card",
    },
    borderColor: {
      control: { type: "color" },
      description: "Border color of the card",
    },
    glareColor: {
      control: { type: "color" },
      description: "Color of the glare sweep effect",
    },
    glareOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Opacity of the glare effect",
    },
    glareAngle: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Angle of the glare gradient in degrees",
    },
    glareSize: {
      control: { type: "range", min: 50, max: 500, step: 10 },
      description: "Size of the glare as a percentage",
    },
    transitionDuration: {
      control: { type: "range", min: 200, max: 2000, step: 50 },
      description: "Duration of the glare animation in milliseconds",
    },
    playOnce: {
      control: { type: "boolean" },
      description: "Only play the glare animation once per hover",
    },
  },
  args: {
    width: "300px",
    height: "200px",
    background: "#000",
    borderRadius: "10px",
    borderColor: "#333",
    glareColor: "#ffffff",
    glareOpacity: 0.5,
    glareAngle: -45,
    glareSize: 250,
    transitionDuration: 650,
    playOnce: false,
  },
} satisfies Meta<typeof GlareHover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div style={{ color: "white", textAlign: "center", padding: 24 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Hover Me</h3>
        <p style={{ margin: "8px 0 0", opacity: 0.6, fontSize: 14 }}>Glare effect on hover</p>
      </div>
    ),
  },
}

export const BlueGlare: Story = {
  args: {
    width: "350px",
    height: "250px",
    background: "#0a1628",
    borderColor: "#1e3a5f",
    glareColor: "#4fc3f7",
    glareOpacity: 0.4,
    glareAngle: -30,
    transitionDuration: 800,
    children: (
      <div style={{ color: "white", textAlign: "center", padding: 24 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Blue Glare</h3>
        <p style={{ margin: "8px 0 0", opacity: 0.6, fontSize: 14 }}>Custom glare color</p>
      </div>
    ),
  },
}
