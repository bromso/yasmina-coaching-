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

/** A pill for every selected day, the first column (Monday) and the last (Sunday) included. */
export const SelectedEdgeDays: Story = {
  render: function Render() {
    const [date, setDate] = React.useState<Date | undefined>()
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        weekStartsOn={1}
        defaultMonth={new Date(2026, 10, 1)}
        className="rounded-md border"
      />
    )
  },
  play: async ({ canvasElement }) => {
    // The day buttons re-render on selection, so each one is looked up again after the click.
    const dayButton = (iso: string) => {
      const button = canvasElement.querySelector<HTMLButtonElement>(`td[data-day="${iso}"] button`)
      if (!button) throw new Error(`no day ${iso}`)
      return button
    }
    const isPill = (button: HTMLButtonElement) => {
      const style = getComputedStyle(button)
      const half = button.getBoundingClientRect().height / 2
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomLeftRadius,
        style.borderBottomRightRadius,
      ].every((radius) => Number.parseFloat(radius) >= half)
    }
    for (const iso of ["2026-11-02", "2026-11-08"]) {
      await userEvent.click(dayButton(iso))
      await expect(dayButton(iso)).toHaveAttribute("data-selected-single", "true")
      await expect(isPill(dayButton(iso))).toBe(true)
    }
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
