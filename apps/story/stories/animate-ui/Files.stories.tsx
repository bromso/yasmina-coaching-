import {
  FileItem,
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
} from "@repo/ui/components/animate-ui/components/radix/files"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Radix/Files",
  component: Files,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Files>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Files className="w-[300px] rounded-md border">
      <FolderItem value="src">
        <FolderTrigger>src</FolderTrigger>
        <FolderContent>
          <FolderItem value="components">
            <FolderTrigger>components</FolderTrigger>
            <FolderContent>
              <FileItem>Button.tsx</FileItem>
              <FileItem>Card.tsx</FileItem>
              <FileItem>Dialog.tsx</FileItem>
            </FolderContent>
          </FolderItem>
          <FolderItem value="lib">
            <FolderTrigger>lib</FolderTrigger>
            <FolderContent>
              <FileItem>utils.ts</FileItem>
            </FolderContent>
          </FolderItem>
          <FileItem>App.tsx</FileItem>
          <FileItem>main.tsx</FileItem>
        </FolderContent>
      </FolderItem>
      <FileItem>package.json</FileItem>
      <FileItem>tsconfig.json</FileItem>
    </Files>
  ),
}

export const WithGitStatus: Story = {
  render: () => (
    <Files className="w-[300px] rounded-md border">
      <FolderItem value="src">
        <FolderTrigger gitStatus="modified">src</FolderTrigger>
        <FolderContent>
          <FileItem gitStatus="modified">App.tsx</FileItem>
          <FileItem gitStatus="untracked">NewComponent.tsx</FileItem>
          <FileItem gitStatus="deleted">OldComponent.tsx</FileItem>
          <FileItem>index.ts</FileItem>
        </FolderContent>
      </FolderItem>
      <FolderItem value="tests">
        <FolderTrigger gitStatus="untracked">tests</FolderTrigger>
        <FolderContent>
          <FileItem gitStatus="untracked">App.test.tsx</FileItem>
        </FolderContent>
      </FolderItem>
      <FileItem>package.json</FileItem>
    </Files>
  ),
}

export const FlatFiles: Story = {
  render: () => (
    <Files className="w-[300px] rounded-md border">
      <FileItem>README.md</FileItem>
      <FileItem>package.json</FileItem>
      <FileItem>tsconfig.json</FileItem>
      <FileItem>.gitignore</FileItem>
      <FileItem>bun.lock</FileItem>
    </Files>
  ),
}

export const DeepNesting: Story = {
  render: () => (
    <Files className="w-[350px] rounded-md border">
      <FolderItem value="packages">
        <FolderTrigger>packages</FolderTrigger>
        <FolderContent>
          <FolderItem value="ui">
            <FolderTrigger>ui</FolderTrigger>
            <FolderContent>
              <FolderItem value="src">
                <FolderTrigger>src</FolderTrigger>
                <FolderContent>
                  <FolderItem value="components">
                    <FolderTrigger>components</FolderTrigger>
                    <FolderContent>
                      <FileItem>button.tsx</FileItem>
                      <FileItem>dialog.tsx</FileItem>
                    </FolderContent>
                  </FolderItem>
                  <FileItem>index.ts</FileItem>
                </FolderContent>
              </FolderItem>
              <FileItem>package.json</FileItem>
            </FolderContent>
          </FolderItem>
        </FolderContent>
      </FolderItem>
    </Files>
  ),
}
