import Folder from "@repo/ui/components/Folder"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/Folder",
  component: Folder,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "color" },
      description: "Primary color of the folder",
    },
    size: {
      control: { type: "number", min: 0.5, max: 3, step: 0.1 },
      description: "Scale factor for the folder",
    },
  },
  args: {
    color: "#5227FF",
    size: 1,
  },
} satisfies Meta<typeof Folder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithItems: Story = {
  args: {
    color: "#10B981",
    size: 1.5,
    items: [
      <div
        key="1"
        style={{
          padding: "8px",
          fontSize: "10px",
          color: "#333",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Page 1
      </div>,
      <div
        key="2"
        style={{
          padding: "8px",
          fontSize: "10px",
          color: "#333",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Page 2
      </div>,
      <div
        key="3"
        style={{
          padding: "8px",
          fontSize: "10px",
          color: "#333",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Page 3
      </div>,
    ],
  },
}
