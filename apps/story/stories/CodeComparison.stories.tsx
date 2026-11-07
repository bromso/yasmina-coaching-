import { CodeComparison } from "@repo/ui/components/code-comparison"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Data Display/CodeComparison",
  component: CodeComparison,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    language: {
      control: "text",
      description: "Programming language for syntax highlighting",
    },
    filename: {
      control: "text",
      description: "Filename displayed in the header of each panel",
    },
    lightTheme: {
      control: "text",
      description: "Shiki theme name for light mode",
    },
    darkTheme: {
      control: "text",
      description: "Shiki theme name for dark mode",
    },
    highlightColor: {
      control: "color",
      description: "Color used for highlighted lines",
    },
  },
} satisfies Meta<typeof CodeComparison>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    beforeCode: `function greet(name) {
  console.log("Hello, " + name)
  return name
}`,
    afterCode: `function greet(name: string) {
  console.log(\`Hello, \${name}\`)
  return name
}`,
    language: "typescript",
    filename: "greet.ts",
    lightTheme: "github-light",
    darkTheme: "github-dark",
  },
}

export const ReactRefactor: Story = {
  args: {
    beforeCode: `import React from "react"

class Counter extends React.Component {
  state = { count: 0 }

  increment = () => {
    this.setState({ count: this.state.count + 1 })
  }

  render() {
    return (
      <button onClick={this.increment}>
        Count: {this.state.count}
      </button>
    )
  }
}`,
    afterCode: `import { useState } from "react"

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  )
}`,
    language: "tsx",
    filename: "Counter.tsx",
    lightTheme: "github-light",
    darkTheme: "github-dark",
  },
}

export const CSSToTailwind: Story = {
  args: {
    beforeCode: `.card {
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}`,
    afterCode: `{/* Using Tailwind CSS utility classes */}
<div className="flex flex-col p-6 rounded-lg
  border border-gray-200 shadow-sm">
  <h3 className="text-xl font-semibold mb-2">
    Card Title
  </h3>
</div>`,
    language: "css",
    filename: "card.css",
    lightTheme: "github-light",
    darkTheme: "github-dark",
  },
}

export const CustomHighlightColor: Story = {
  args: {
    beforeCode: `const config = {
  port: 3000,
  host: "localhost",
  debug: false,
}`,
    afterCode: `const config = {
  port: 8080,
  host: "0.0.0.0",
  debug: true,
}`,
    language: "typescript",
    filename: "config.ts",
    lightTheme: "github-light",
    darkTheme: "github-dark",
    highlightColor: "#4f46e5",
  },
}
