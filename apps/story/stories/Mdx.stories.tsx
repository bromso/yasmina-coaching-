import {
  Callout,
  CodeBlock,
  Heading,
  MdxCode,
  MdxImage,
  MdxLi,
  MdxOl,
  MdxParagraph,
  MdxTable,
  MdxTbody,
  MdxTd,
  MdxTh,
  MdxThead,
  MdxTr,
  MdxUl,
  Step,
  Steps,
  Tab,
  Tabs,
} from "@repo/ui/components/mdx"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Mdx",
  component: Callout,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  // Every story below overrides the whole body with `render`; this default only satisfies
  // Callout's required `children` for the stories object's type.
  args: { children: "Example" },
} satisfies Meta<typeof Callout>

export default meta
type Story = StoryObj<typeof meta>

export const Headings: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Heading as="h2" id="getting-started">
        Getting started
      </Heading>
      <Heading as="h3" id="installation">
        Installation
      </Heading>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("link", { name: "Link to section: Getting started" })
    ).toHaveAttribute("href", "#getting-started")
    await expect(
      canvas.getByRole("link", { name: "Link to section: Installation" })
    ).toHaveAttribute("href", "#installation")
  },
}

export const Code: Story = {
  render: () => (
    <CodeBlock title="app.ts" className="shiki">
      <code>console.log(&quot;hello&quot;)</code>
    </CodeBlock>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("app.ts")).toBeInTheDocument()
    await expect(await canvas.findByRole("button", { name: "Copy code" })).toBeInTheDocument()
  },
}

export const Prose: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <MdxParagraph>
        A paragraph with <MdxCode>inline code</MdxCode> in it.
      </MdxParagraph>
      <MdxUl>
        <MdxLi>A bullet</MdxLi>
        <MdxLi>Another bullet</MdxLi>
      </MdxUl>
      <MdxOl>
        <MdxLi>First</MdxLi>
        <MdxLi>Second</MdxLi>
      </MdxOl>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("list")).toHaveLength(2)
    await expect(canvas.getByText("inline code")).toHaveAttribute("data-slot", "inline-code")
  },
}

export const Callouts: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Callout type="note" title="Note">
        General information worth knowing.
      </Callout>
      <Callout type="tip" title="Tip">
        A helpful shortcut.
      </Callout>
      <Callout type="warning" title="Warning">
        Be careful here.
      </Callout>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("note")).toHaveLength(3)
  },
}

export const TabsExample: Story = {
  render: () => (
    <Tabs items={["npm", "bun"]}>
      <Tab value="npm">npm install @repo/ui</Tab>
      <Tab value="bun">bun add @repo/ui</Tab>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole("tab", { name: "npm" })).toBeInTheDocument()
  },
}

/** No `items` at all, and a mismatched list: every `<Tab>` still gets its own trigger. */
export const TabsWithoutItems: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Tabs>
        <Tab value="npm">npm install @repo/ui</Tab>
        <Tab value="bun">bun add @repo/ui</Tab>
      </Tabs>
      <Tabs items={["yarn", "pnpm"]}>
        <Tab value="pnpm">pnpm add @repo/ui</Tab>
        <Tab value="deno">deno add npm:@repo/ui</Tab>
      </Tabs>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bun = await canvas.findByRole("tab", { name: "bun" })
    await userEvent.click(bun)
    await expect(canvas.getByText("bun add @repo/ui")).toBeVisible()
    await expect(canvas.queryByRole("tab", { name: "yarn" })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole("tab", { name: "deno" }))
    await expect(canvas.getByText("deno add npm:@repo/ui")).toBeVisible()
  },
}

export const StepsExample: Story = {
  render: () => (
    <Steps>
      <Step>Install the package.</Step>
      <Step>Import the component.</Step>
      <Step>Render it.</Step>
    </Steps>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Install the package.")).toBeInTheDocument()
  },
}

export const Image: Story = {
  render: () => (
    <MdxImage src="https://placehold.co/800x400" alt="Placeholder" width={800} height={400} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByAltText("Placeholder")).toBeInTheDocument()
  },
}

/** A markdown table: its own scroll box (the page never scrolls sideways), column headers. */
export const Table: Story = {
  render: () => (
    <div className="w-48">
      <MdxTable>
        <MdxThead>
          <MdxTr>
            <MdxTh>Name</MdxTh>
            <MdxTh>What it does</MdxTh>
            <MdxTh>How long</MdxTh>
          </MdxTr>
        </MdxThead>
        <MdxTbody>
          <MdxTr>
            <MdxTd>
              <MdxCode>two_factor</MdxCode>
            </MdxTd>
            <MdxTd>Keeps your sign-in while you type the code from your app.</MdxTd>
            <MdxTd>5 minutes</MdxTd>
          </MdxTr>
          <MdxTr>
            <MdxTd>
              <MdxCode>consent</MdxCode>
            </MdxTd>
            <MdxTd>Remembers your cookie choice.</MdxTd>
            <MdxTd>180 days</MdxTd>
          </MdxTr>
        </MdxTbody>
      </MdxTable>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const headers = canvas.getAllByRole("columnheader")
    await expect(headers).toHaveLength(3)
    for (const header of headers) await expect(header).toHaveAttribute("scope", "col")
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="mdx-table"]')
    await expect(box).not.toBeNull()
    await expect(getComputedStyle(box as HTMLElement).overflowX).toBe("auto")
    await expect(box).toHaveAttribute("tabindex", "0")
    // The narrow box scrolls the table rather than squeezing the code names apart.
    await expect((box as HTMLElement).scrollWidth).toBeGreaterThan((box as HTMLElement).clientWidth)
  },
}
