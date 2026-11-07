import { Endpoint, type JsonSchema, SchemaTable } from "@repo/ui/components/mdx"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const id: JsonSchema = { type: "integer", exclusiveMinimum: 0 }

/** A note, as the /v1 reference shows it: nested, nullable, a union and a date-time. */
const note: JsonSchema = {
  type: "object",
  properties: {
    id,
    title: { type: "string" },
    body: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    author: {
      anyOf: [
        {
          anyOf: [
            {
              type: "object",
              properties: { type: { const: "user" }, id, name: { type: "string" } },
              required: ["type", "id", "name"],
            },
            {
              type: "object",
              properties: { type: { const: "api_key" }, id, name: { type: "string" } },
              required: ["type", "id", "name"],
            },
          ],
        },
        { type: "null" },
      ],
    },
  },
  required: ["id", "title", "body", "createdAt", "author"],
}

const meta = {
  title: "Components/Mdx/ApiReference",
  component: SchemaTable,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: { caption: "Response body", schema: note },
} satisfies Meta<typeof SchemaTable>

export default meta
type Story = StoryObj<typeof meta>

export const NoteResponse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = canvas.getByRole("table", { name: "Response body" })
    await expect(table).toBeInTheDocument()
    await expect(within(table).getByRole("columnheader", { name: "Type" })).toBeInTheDocument()
    await expect(within(table).getByRole("rowheader", { name: "author.type" })).toBeInTheDocument()
    await expect(within(table).getByText("object | null")).toBeInTheDocument()
    // The scrolling container is a named, focusable region.
    const region = canvas.getByRole("region", { name: "Response body fields" })
    await expect(region).toHaveAttribute("tabindex", "0")
    await expect(within(table).getAllByText("Required").length).toBeGreaterThan(0)
  },
}

export const RequestBodyWithLimits: Story = {
  args: {
    caption: "Request body",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", maxLength: 10000, default: "" },
      },
      required: ["title"],
    },
  },
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole("table", { name: "Request body" })
    await expect(within(table).getByText(/1–200 characters\./)).toBeInTheDocument()
    await expect(within(table).getByText(/Up to 10,000 characters\./)).toBeInTheDocument()
    await expect(within(table).getByText("Optional")).toBeInTheDocument()
  },
}

export const PageWithArrayAndEnum: Story = {
  args: {
    caption: "Response body",
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: id,
              role: { enum: ["viewer", "member", "admin", "owner"], type: "string" },
            },
            required: ["userId", "role"],
          },
        },
        nextCursor: { anyOf: [id, { type: "null" }] },
      },
      required: ["items", "nextCursor"],
    },
  },
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole("table", { name: "Response body" })
    await expect(within(table).getByRole("rowheader", { name: "items[].role" })).toBeInTheDocument()
    await expect(within(table).getByText("array of object")).toBeInTheDocument()
    await expect(within(table).getByText("integer | null")).toBeInTheDocument()
    for (const role of ["viewer", "member", "admin", "owner"])
      await expect(within(table).getByText(role)).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { caption: "Response body", schema: { type: "object", properties: {} } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/No fields\./)).toBeInTheDocument()
    await expect(canvas.queryByRole("table")).toBeNull()
  },
}

export const Endpoints: Story = {
  render: () => (
    <div className="flex flex-col">
      <Endpoint method="GET" path="/v1/notes/{id}" scope="notes:read" />
      <Endpoint method="POST" path="/v1/notes" scope="notes:write" />
      <Endpoint method="DELETE" path="/v1/notes/{id}" scope="notes:write" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("/v1/notes")).toBeInTheDocument()
    await expect(canvas.getAllByText("Method:", { exact: false })).toHaveLength(3)
    for (const method of ["GET", "POST", "DELETE"])
      await expect(canvas.getByText(method)).toBeInTheDocument()
    await expect(canvas.getAllByText("Required scope:", { exact: false })).toHaveLength(3)
  },
}
