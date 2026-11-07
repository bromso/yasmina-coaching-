import { Code, CodeBlock, CodeHeader } from "@repo/ui/components/animate-ui/components/animate/code"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/Code",
  component: Code,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Code>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

const sampleCode = `import { Button } from "@repo/ui/components/button"

export default function App() {
  return (
    <Button variant="outline">
      Click me
    </Button>
  )
}`

export const Default: Story = {
  render: () => (
    <Code code={sampleCode}>
      <CodeHeader copyButton>app.tsx</CodeHeader>
      <CodeBlock lang="tsx" />
    </Code>
  ),
}

export const WithoutHeader: Story = {
  render: () => (
    <Code code="npm install @repo/ui">
      <CodeBlock lang="bash" />
    </Code>
  ),
}

export const WithCursor: Story = {
  render: () => (
    <Code code={sampleCode}>
      <CodeHeader>typing-demo.tsx</CodeHeader>
      <CodeBlock lang="tsx" cursor />
    </Code>
  ),
}

export const HeaderWithoutCopyButton: Story = {
  render: () => (
    <Code code="console.log('Hello, world!')">
      <CodeHeader>example.js</CodeHeader>
      <CodeBlock lang="javascript" />
    </Code>
  ),
}

export const LongCode: Story = {
  render: () => (
    <Code
      code={`// A longer code example
import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@repo/ui/lib/utils"

type AnimatedCardProps = {
  title: string
  description: string
  isVisible: boolean
}

export function AnimatedCard({
  title,
  description,
  isVisible,
}: AnimatedCardProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn("rounded-lg border p-4")}
        >
          <h3>{title}</h3>
          <p>{description}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}`}
    >
      <CodeHeader copyButton>animated-card.tsx</CodeHeader>
      <CodeBlock lang="tsx" />
    </Code>
  ),
}
