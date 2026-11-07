import {
  CollapseButton,
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from "@repo/ui/components/file-tree"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Data Display/FileTree",
  component: Tree,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    indicator: {
      control: "boolean",
      description: "Show tree indentation indicator lines",
    },
    initialSelectedId: {
      control: "text",
      description: "ID of the initially selected file or folder",
    },
  },
} satisfies Meta<typeof Tree>

export default meta
type Story = StoryObj<typeof meta>

const sampleElements: TreeViewElement[] = [
  {
    id: "src",
    name: "src",
    children: [
      {
        id: "components",
        name: "components",
        children: [
          { id: "button.tsx", name: "button.tsx" },
          { id: "card.tsx", name: "card.tsx" },
          { id: "input.tsx", name: "input.tsx" },
        ],
      },
      {
        id: "lib",
        name: "lib",
        children: [{ id: "utils.ts", name: "utils.ts" }],
      },
      { id: "app.tsx", name: "app.tsx" },
      { id: "index.tsx", name: "index.tsx" },
    ],
  },
  {
    id: "public",
    name: "public",
    children: [
      { id: "favicon.ico", name: "favicon.ico" },
      { id: "index.html", name: "index.html" },
    ],
  },
  { id: "package.json", name: "package.json" },
  { id: "tsconfig.json", name: "tsconfig.json" },
]

export const Default: Story = {
  render: (args) => (
    <div className="w-64 h-80 border rounded-md">
      <Tree
        {...args}
        elements={sampleElements}
        initialExpandedItems={["src", "components"]}
        className="p-2"
      >
        <Folder element="src" value="src">
          <Folder element="components" value="components">
            <File value="button.tsx">
              <span>button.tsx</span>
            </File>
            <File value="card.tsx">
              <span>card.tsx</span>
            </File>
            <File value="input.tsx">
              <span>input.tsx</span>
            </File>
          </Folder>
          <Folder element="lib" value="lib">
            <File value="utils.ts">
              <span>utils.ts</span>
            </File>
          </Folder>
          <File value="app.tsx">
            <span>app.tsx</span>
          </File>
          <File value="index.tsx">
            <span>index.tsx</span>
          </File>
        </Folder>
        <Folder element="public" value="public">
          <File value="favicon.ico">
            <span>favicon.ico</span>
          </File>
          <File value="index.html">
            <span>index.html</span>
          </File>
        </Folder>
        <File value="package.json">
          <span>package.json</span>
        </File>
        <File value="tsconfig.json">
          <span>tsconfig.json</span>
        </File>
      </Tree>
    </div>
  ),
}

export const WithInitialSelection: Story = {
  render: (args) => (
    <div className="w-64 h-80 border rounded-md">
      <Tree
        {...args}
        elements={sampleElements}
        initialSelectedId="button.tsx"
        initialExpandedItems={["src", "components"]}
        className="p-2"
      >
        <Folder element="src" value="src">
          <Folder element="components" value="components">
            <File value="button.tsx">
              <span>button.tsx</span>
            </File>
            <File value="card.tsx">
              <span>card.tsx</span>
            </File>
            <File value="input.tsx">
              <span>input.tsx</span>
            </File>
          </Folder>
          <Folder element="lib" value="lib">
            <File value="utils.ts">
              <span>utils.ts</span>
            </File>
          </Folder>
          <File value="app.tsx">
            <span>app.tsx</span>
          </File>
        </Folder>
        <File value="package.json">
          <span>package.json</span>
        </File>
      </Tree>
    </div>
  ),
}

export const NoIndicator: Story = {
  render: (args) => (
    <div className="w-64 h-64 border rounded-md">
      <Tree
        {...args}
        elements={sampleElements}
        indicator={false}
        initialExpandedItems={["src"]}
        className="p-2"
      >
        <Folder element="src" value="src">
          <File value="app.tsx">
            <span>app.tsx</span>
          </File>
          <File value="index.tsx">
            <span>index.tsx</span>
          </File>
        </Folder>
        <File value="package.json">
          <span>package.json</span>
        </File>
      </Tree>
    </div>
  ),
}

export const WithCollapseButton: Story = {
  render: () => (
    <div className="relative w-64 h-80 border rounded-md">
      <Tree elements={sampleElements} initialExpandedItems={["src", "components"]} className="p-2">
        <Folder element="src" value="src">
          <Folder element="components" value="components">
            <File value="button.tsx">
              <span>button.tsx</span>
            </File>
            <File value="card.tsx">
              <span>card.tsx</span>
            </File>
          </Folder>
          <File value="app.tsx">
            <span>app.tsx</span>
          </File>
        </Folder>
        <File value="package.json">
          <span>package.json</span>
        </File>
        <CollapseButton elements={sampleElements}>Toggle All</CollapseButton>
      </Tree>
    </div>
  ),
}
