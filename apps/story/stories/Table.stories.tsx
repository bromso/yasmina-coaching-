import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Table",
  component: Table,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

const invoices = [
  { invoice: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
  { invoice: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
  { invoice: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
  { invoice: "INV004", status: "Paid", method: "Credit Card", amount: "$450.00" },
  { invoice: "INV005", status: "Paid", method: "PayPal", amount: "$550.00" },
]

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.invoice}>
            <TableCell className="font-medium">{invoice.invoice}</TableCell>
            <TableCell>{invoice.status}</TableCell>
            <TableCell>{invoice.method}</TableCell>
            <TableCell className="text-right">{invoice.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$1,750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const table = canvas.getByRole("table")

    await expect(table).toBeInTheDocument()
    await expect(canvas.getByText("INV001")).toBeInTheDocument()
    await expect(canvas.getByText("$1,750.00")).toBeInTheDocument()
  },
}

export const Simple: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
          <TableCell>Admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
          <TableCell>Editor</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Bob Wilson</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>Viewer</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}

export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>Monthly sales report for Q4 2024</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>Revenue</TableHead>
          <TableHead>Growth</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>October</TableCell>
          <TableCell>$12,000</TableCell>
          <TableCell className="text-green-600">+5%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>November</TableCell>
          <TableCell>$14,500</TableCell>
          <TableCell className="text-green-600">+20%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>December</TableCell>
          <TableCell>$18,200</TableCell>
          <TableCell className="text-green-600">+25%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}
