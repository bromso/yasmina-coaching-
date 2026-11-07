import ModelViewer from "@repo/ui/components/ModelViewer"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/ModelViewer",
  component: ModelViewer,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs", "!test"],
  argTypes: {
    url: {
      control: "text",
      description: "URL to a .glb, .gltf, .fbx, or .obj model file",
    },
    width: {
      control: "text",
      description: "Width of the viewer container",
    },
    height: {
      control: "text",
      description: "Height of the viewer container",
    },
    defaultRotationX: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Initial X rotation in degrees",
    },
    defaultRotationY: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Initial Y rotation in degrees",
    },
    defaultZoom: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "Default camera distance",
    },
    enableMouseParallax: {
      control: "boolean",
      description: "Enable subtle parallax on mouse move",
    },
    enableManualRotation: {
      control: "boolean",
      description: "Allow drag to rotate the model",
    },
    enableHoverRotation: {
      control: "boolean",
      description: "Rotate model based on hover position",
    },
    enableManualZoom: {
      control: "boolean",
      description: "Allow scroll/pinch to zoom",
    },
    environmentPreset: {
      control: "select",
      options: ["city", "sunset", "night", "dawn", "studio", "apartment", "forest", "park", "none"],
      description: "HDR environment preset",
    },
    autoFrame: {
      control: "boolean",
      description: "Automatically frame the model in view",
    },
    showScreenshotButton: {
      control: "boolean",
      description: "Show the screenshot button",
    },
    fadeIn: {
      control: "boolean",
      description: "Fade in the model when loaded",
    },
    autoRotate: {
      control: "boolean",
      description: "Automatically rotate the model",
    },
    autoRotateSpeed: {
      control: { type: "range", min: 0.05, max: 2, step: 0.05 },
      description: "Speed of auto rotation",
    },
    ambientIntensity: {
      control: { type: "range", min: 0, max: 2, step: 0.1 },
      description: "Ambient light intensity",
    },
  },
  args: {
    url: "https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf",
    width: "100vw",
    height: "100vh",
    defaultRotationX: -50,
    defaultRotationY: 20,
    defaultZoom: 0.5,
    enableMouseParallax: true,
    enableManualRotation: true,
    enableHoverRotation: true,
    enableManualZoom: true,
    environmentPreset: "forest",
    autoFrame: false,
    showScreenshotButton: true,
    fadeIn: false,
    autoRotate: false,
    autoRotateSpeed: 0.35,
    ambientIntensity: 0.3,
  },
} satisfies Meta<typeof ModelViewer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const AutoRotating: Story = {
  args: {
    autoRotate: true,
    autoRotateSpeed: 0.5,
    enableHoverRotation: false,
    showScreenshotButton: false,
  },
}
