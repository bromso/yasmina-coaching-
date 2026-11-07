import TargetCursor from "@repo/ui/components/TargetCursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/TargetCursor",
  component: TargetCursor,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    targetSelector: { control: "text" },
    spinDuration: { control: { type: "number", min: 0.5, max: 5, step: 0.5 } },
    hideDefaultCursor: { control: "boolean" },
    hoverDuration: { control: { type: "number", min: 0.05, max: 1, step: 0.05 } },
    parallaxOn: { control: "boolean" },
  },
  args: {
    targetSelector: ".cursor-target",
    spinDuration: 2,
    hideDefaultCursor: true,
    hoverDuration: 0.2,
    parallaxOn: true,
  },
} satisfies Meta<typeof TargetCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <TargetCursor {...args} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2rem",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "1.25rem",
            fontFamily: "system-ui, sans-serif",
            userSelect: "none",
          }}
        >
          Move your mouse around. Hover over the buttons below.
        </p>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="button"
            className="cursor-target"
            style={{
              padding: "12px 24px",
              background: "#5227FF",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "1rem",
              fontFamily: "system-ui, sans-serif",
              cursor: "none",
            }}
          >
            Hover me
          </button>
          <button
            type="button"
            className="cursor-target"
            style={{
              padding: "12px 24px",
              background: "#FF79C6",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "1rem",
              fontFamily: "system-ui, sans-serif",
              cursor: "none",
            }}
          >
            And me
          </button>
        </div>
      </div>
    </div>
  ),
}
