import { CodeTabs } from "@repo/ui/components/animate-ui/components/animate/code-tabs"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/CodeTabs",
  component: CodeTabs,
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
} satisfies Meta<typeof CodeTabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    codes: {
      npm: "npm install @repo/ui",
      yarn: "yarn add @repo/ui",
      pnpm: "pnpm add @repo/ui",
      bun: "bun add @repo/ui",
    },
  },
}

export const SingleTab: Story = {
  args: {
    codes: {
      bash: "curl -fsSL https://example.com/install.sh | bash",
    },
  },
}

export const WithoutCopyButton: Story = {
  args: {
    codes: {
      npm: "npm install react",
      yarn: "yarn add react",
    },
    copyButton: false,
  },
}

export const TypeScriptCode: Story = {
  args: {
    codes: {
      "index.ts": 'import { Button } from "@repo/ui/components/button"',
      "app.tsx": "export default function App() {\n  return <Button>Click me</Button>\n}",
    },
    lang: "typescript",
  },
}
