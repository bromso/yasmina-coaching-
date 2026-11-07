import { AnimatedSpan, Terminal, TypingAnimation } from "@repo/ui/components/terminal"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Data Display/Terminal",
  component: Terminal,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    sequence: {
      control: "boolean",
      description: "Whether children animate in sequence or independently",
    },
    startOnView: {
      control: "boolean",
      description: "Start the animation when the terminal scrolls into view",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
  },
} satisfies Meta<typeof Terminal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Terminal {...args}>
      <TypingAnimation>$ npm install @repo/ui</TypingAnimation>
      <AnimatedSpan delay={1500} className="text-green-500">
        <span>+ @repo/ui@1.0.0</span>
      </AnimatedSpan>
      <AnimatedSpan delay={2000} className="text-green-500">
        <span>added 120 packages in 3.2s</span>
      </AnimatedSpan>
      <AnimatedSpan delay={2500} className="text-muted-foreground">
        <span>Done in 3.2s.</span>
      </AnimatedSpan>
    </Terminal>
  ),
}

export const GitWorkflow: Story = {
  render: (args) => (
    <Terminal {...args}>
      <TypingAnimation>$ git add .</TypingAnimation>
      <AnimatedSpan delay={800}>
        <span>$ git commit -m "feat: add new component"</span>
      </AnimatedSpan>
      <AnimatedSpan delay={1600} className="text-green-500">
        <span>[main abc1234] feat: add new component</span>
      </AnimatedSpan>
      <AnimatedSpan delay={2000} className="text-muted-foreground">
        <span> 3 files changed, 142 insertions(+), 12 deletions(-)</span>
      </AnimatedSpan>
      <AnimatedSpan delay={2500}>
        <span>$ git push origin main</span>
      </AnimatedSpan>
      <AnimatedSpan delay={3200} className="text-green-500">
        <span>To github.com:user/repo.git</span>
      </AnimatedSpan>
      <AnimatedSpan delay={3500} className="text-green-500">
        <span> abc1234..def5678 main -&gt; main</span>
      </AnimatedSpan>
    </Terminal>
  ),
}

export const NoSequence: Story = {
  render: (args) => (
    <Terminal {...args}>
      <AnimatedSpan className="text-green-500">
        <span>All tests passed (42/42)</span>
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground">
        <span>Coverage: 98.5%</span>
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground">
        <span>Time: 2.3s</span>
      </AnimatedSpan>
    </Terminal>
  ),
  args: {
    sequence: false,
  },
}

export const BuildOutput: Story = {
  render: (args) => (
    <Terminal {...args}>
      <TypingAnimation>$ bun run build</TypingAnimation>
      <AnimatedSpan delay={1000} className="text-muted-foreground">
        <span>Compiling TypeScript...</span>
      </AnimatedSpan>
      <AnimatedSpan delay={1800} className="text-muted-foreground">
        <span>Bundling with esbuild...</span>
      </AnimatedSpan>
      <AnimatedSpan delay={2400} className="text-green-500">
        <span>Build completed successfully</span>
      </AnimatedSpan>
      <AnimatedSpan delay={3000} className="text-muted-foreground">
        <span>Output: dist/index.js (24.3 kB)</span>
      </AnimatedSpan>
      <AnimatedSpan delay={3200} className="text-muted-foreground">
        <span>Output: dist/index.css (8.1 kB)</span>
      </AnimatedSpan>
    </Terminal>
  ),
}
