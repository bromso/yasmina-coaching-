import {
  FileItem,
  Files,
  FolderItem,
  FolderPanel,
  FolderTrigger,
} from "@repo/ui/components/animate-ui/components/base/files"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Animate UI/Base/Files",
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
        <FolderPanel>
          <FolderItem value="components">
            <FolderTrigger>components</FolderTrigger>
            <FolderPanel>
              <FileItem>Button.tsx</FileItem>
              <FileItem>Input.tsx</FileItem>
              <FileItem>Dialog.tsx</FileItem>
            </FolderPanel>
          </FolderItem>
          <FolderItem value="lib">
            <FolderTrigger>lib</FolderTrigger>
            <FolderPanel>
              <FileItem>utils.ts</FileItem>
            </FolderPanel>
          </FolderItem>
          <FileItem>App.tsx</FileItem>
          <FileItem>index.ts</FileItem>
        </FolderPanel>
      </FolderItem>
      <FileItem>package.json</FileItem>
      <FileItem>tsconfig.json</FileItem>
    </Files>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "src" }))
    await waitFor(async () => expect(await canvas.findByText("App.tsx")).toBeVisible())
    await userEvent.click(canvas.getByRole("button", { name: "components" }))
    await waitFor(async () => expect(await canvas.findByText("Button.tsx")).toBeVisible())
  },
}

export const WithGitStatus: Story = {
  render: () => (
    <Files className="w-[300px] rounded-md border">
      <FolderItem value="src">
        <FolderTrigger gitStatus="modified">src</FolderTrigger>
        <FolderPanel>
          <FileItem gitStatus="modified">App.tsx</FileItem>
          <FileItem gitStatus="untracked">NewComponent.tsx</FileItem>
          <FileItem gitStatus="deleted">OldComponent.tsx</FileItem>
          <FileItem>index.ts</FileItem>
        </FolderPanel>
      </FolderItem>
      <FolderItem value="tests">
        <FolderTrigger gitStatus="untracked">tests</FolderTrigger>
        <FolderPanel>
          <FileItem gitStatus="untracked">App.test.tsx</FileItem>
        </FolderPanel>
      </FolderItem>
      <FileItem>package.json</FileItem>
    </Files>
  ),
}

export const FlatFileList: Story = {
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
