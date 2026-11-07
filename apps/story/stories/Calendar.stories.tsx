import { Calendar } from "@repo/ui/components/calendar"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/Inputs/Calendar",
  component: Calendar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    mode: {
      control: "select",
      options: ["single", "multiple", "range"],
      description: "The selection mode for the calendar",
    },
    numberOfMonths: {
      control: { type: "number", min: 1, max: 3 },
      description: "Number of months to display",
    },
    showOutsideDays: {
      control: "boolean",
      description: "Show days from adjacent months",
    },
    captionLayout: {
      control: "select",
      options: ["label", "dropdown"],
      description: "Layout style for the calendar caption",
    },
  },
} satisfies Meta<typeof Calendar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: function Render() {
    const [date, setDate] = React.useState<Date | undefined>(new Date())

    return (
      <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border" />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const prevButton = canvas.getByRole("button", { name: /previous month/i })
    const nextButton = canvas.getByRole("button", { name: /next month/i })
    await expect(prevButton).toBeInTheDocument()
    await expect(nextButton).toBeInTheDocument()

    await userEvent.click(nextButton)
    await userEvent.click(prevButton)
  },
}

export const Range: Story = {
  render: function Render() {
    const [range, setRange] = React.useState<{ from: Date | undefined; to?: Date } | undefined>({
      from: new Date(),
      to: new Date(new Date().setDate(new Date().getDate() + 7)),
    })

    return (
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        numberOfMonths={2}
        className="rounded-md border"
      />
    )
  },
}

export const Multiple: Story = {
  render: function Render() {
    const [dates, setDates] = React.useState<Date[] | undefined>([new Date()])

    return (
      <Calendar
        mode="multiple"
        selected={dates}
        onSelect={setDates}
        className="rounded-md border"
      />
    )
  },
}

export const WithDisabledDates: Story = {
  render: function Render() {
    const [date, setDate] = React.useState<Date | undefined>(new Date())

    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={(date) => date < new Date()}
        className="rounded-md border"
      />
    )
  },
}

export const WithDropdowns: Story = {
  render: function Render() {
    const [date, setDate] = React.useState<Date | undefined>(new Date())

    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        captionLayout="dropdown"
        fromYear={2020}
        toYear={2030}
        className="rounded-md border"
      />
    )
  },
}
