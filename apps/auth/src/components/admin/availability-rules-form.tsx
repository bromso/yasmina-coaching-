"use client"

import type { AvailabilityRule } from "@repo/api-contract/booking"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { useActionState } from "react"
import { setAvailability } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"
import { WEEKDAY_LABELS, WEEKDAYS_MONDAY_FIRST } from "@/lib/booking-labels"

/**
 * One row per weekday: an "available" box and a start/end window. Saving replaces every stored
 * rule with the ticked rows (the api allows several windows a day; this form keeps one, and shows
 * the first of any extra ones).
 */
export function AvailabilityRulesForm({ rules }: { rules: AvailabilityRule[] }) {
  const [state, action, pending] = useActionState(setAvailability, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const byWeekday = new Map<number, AvailabilityRule>()
  for (const rule of rules) if (!byWeekday.has(rule.weekday)) byWeekday.set(rule.weekday, rule)
  return (
    <form action={action} className="grid gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableCaption className="text-left">
            Times are Stockholm time. Slots start every 30 minutes inside a window.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Day</TableHead>
              <TableHead scope="col">Available</TableHead>
              <TableHead scope="col">From</TableHead>
              <TableHead scope="col">To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {WEEKDAYS_MONDAY_FIRST.map((weekday) => {
              const rule = byWeekday.get(weekday)
              const available = values
                ? values[`available-${weekday}`] === "on"
                : rule !== undefined
              return (
                <TableRow key={weekday}>
                  <TableCell className="font-medium">{WEEKDAY_LABELS[weekday]}</TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      id={`available-${weekday}`}
                      name={`available-${weekday}`}
                      defaultChecked={available}
                      aria-label={`Available on ${WEEKDAY_LABELS[weekday]}`}
                      className="size-4 accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <Label htmlFor={`start-${weekday}`} className="sr-only">
                      {WEEKDAY_LABELS[weekday]} from
                    </Label>
                    <Input
                      id={`start-${weekday}`}
                      name={`start-${weekday}`}
                      type="time"
                      step={1800}
                      className="w-32"
                      defaultValue={values?.[`start-${weekday}`] ?? rule?.start ?? "09:00"}
                      {...fieldAria(`start-${weekday}`, state)}
                    />
                    <FieldError name={`start-${weekday}`} state={state} />
                  </TableCell>
                  <TableCell>
                    <Label htmlFor={`end-${weekday}`} className="sr-only">
                      {WEEKDAY_LABELS[weekday]} to
                    </Label>
                    <Input
                      id={`end-${weekday}`}
                      name={`end-${weekday}`}
                      type="time"
                      step={1800}
                      className="w-32"
                      defaultValue={values?.[`end-${weekday}`] ?? rule?.end ?? "17:00"}
                      {...fieldAria(`end-${weekday}`, state)}
                    />
                    <FieldError name={`end-${weekday}`} state={state} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save weekly availability"}
        </Button>
      </div>
    </form>
  )
}
