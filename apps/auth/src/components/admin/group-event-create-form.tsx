"use client"

import {
  GROUP_EVENT_MAX_CAPACITY,
  GROUP_EVENT_MAX_REPEATS,
  GROUP_OFFERING_KEYS,
  OFFERINGS,
} from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { createGroupEvent } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"
import { LOCATION_LABELS } from "@/lib/booking-labels"
import { NativeSelect } from "./native-select"

const group = OFFERINGS.group

/** Schedules a group event, or the same event weekly for N weeks as one series. */
export function GroupEventCreateForm() {
  const [state, action, pending] = useActionState(createGroupEvent, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const idPrefix = "event-"
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          name="title"
          type="text"
          required
          minLength={2}
          maxLength={120}
          defaultValue={values?.title ?? ""}
          {...fieldAria("title", state, undefined, { idPrefix })}
        />
        <FieldError name="title" state={state} idPrefix={idPrefix} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="event-description">Description (optional)</Label>
        <Textarea
          id="event-description"
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={values?.description ?? ""}
          {...fieldAria("description", state, undefined, { idPrefix })}
        />
        <FieldError name="description" state={state} idPrefix={idPrefix} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="event-offering">Offering</Label>
        <NativeSelect
          id="event-offering"
          name="offering"
          defaultValue={values?.offering ?? "group"}
          {...fieldAria("offering", state, undefined, { idPrefix })}
        >
          {GROUP_OFFERING_KEYS.map((key) => (
            <option key={key} value={key}>
              {OFFERINGS[key].label}
            </option>
          ))}
        </NativeSelect>
        <FieldError name="offering" state={state} idPrefix={idPrefix} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="event-startsAt">Starts (Stockholm time)</Label>
          <Input
            id="event-startsAt"
            name="startsAt"
            type="datetime-local"
            step={900}
            required
            defaultValue={values?.startsAt ?? ""}
            {...fieldAria("startsAt", state, undefined, { idPrefix })}
          />
          <FieldError name="startsAt" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event-durationMinutes">Duration (minutes)</Label>
          <Input
            id="event-durationMinutes"
            name="durationMinutes"
            type="number"
            required
            min={30}
            max={600}
            step={15}
            defaultValue={values?.durationMinutes ?? String(group.durationMinutes)}
            {...fieldAria("durationMinutes", state, undefined, { idPrefix })}
          />
          <FieldError name="durationMinutes" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event-capacity">Seats</Label>
          <Input
            id="event-capacity"
            name="capacity"
            type="number"
            required
            min={1}
            max={GROUP_EVENT_MAX_CAPACITY}
            defaultValue={values?.capacity ?? "8"}
            {...fieldAria("capacity", state, undefined, { idPrefix })}
          />
          <FieldError name="capacity" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event-location">Location</Label>
          <NativeSelect
            id="event-location"
            name="location"
            defaultValue={values?.location ?? group.locations[0]}
            {...fieldAria("location", state, undefined, { idPrefix })}
          >
            {group.locations.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABELS[l]}
              </option>
            ))}
          </NativeSelect>
          <FieldError name="location" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="event-repeatWeeks">Repeat weekly</Label>
          <Input
            id="event-repeatWeeks"
            name="repeatWeeks"
            type="number"
            min={1}
            max={GROUP_EVENT_MAX_REPEATS}
            defaultValue={values?.repeatWeeks ?? "1"}
            {...fieldAria("repeatWeeks", state, "event-repeatWeeks-hint", { idPrefix })}
          />
          <p id="event-repeatWeeks-hint" className="text-muted-foreground text-xs">
            Total number of weeks, this one included. 1 creates a single event.
          </p>
          <FieldError name="repeatWeeks" state={state} idPrefix={idPrefix} />
        </div>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create group event"}
        </Button>
      </div>
    </form>
  )
}
