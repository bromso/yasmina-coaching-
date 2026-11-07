import { type CronSpec, cronMatches, parseCron } from "./cron"
import type { ScheduleDefinition } from "./define"
import type { Enqueue } from "./enqueue"

// `defineSchedule` already parsed each expression once to fail fast; keep the parsed form per
// schedule so a tick does not re-parse every minute.
const specs = new WeakMap<ScheduleDefinition, CronSpec>()
function specOf(schedule: ScheduleDefinition): CronSpec {
  let spec = specs.get(schedule)
  if (!spec) {
    spec = parseCron(schedule.cron)
    specs.set(schedule, spec)
  }
  return spec
}

/** The schedules whose cron matches the UTC minute `at` falls in, and whose `enabled` (if any) says yes. */
export function dueSchedules(
  schedules: readonly ScheduleDefinition[],
  at: Date
): ScheduleDefinition[] {
  return schedules.filter(
    (schedule) => (schedule.enabled?.() ?? true) && cronMatches(specOf(schedule), at)
  )
}

/** `schedule:<name>:<YYYY-MM-DDTHH:MM>` (UTC): one job per schedule and minute. */
export function scheduleKey(name: string, at: Date): string {
  return `schedule:${name}:${at.toISOString().slice(0, 16)}`
}

/**
 * Enqueues every schedule due at `at`. The dedupe key, spent by a job of any status
 * (`dedupeAnyStatus`), makes this safe to run in every worker process: two schedulers ticking the
 * same minute produce one job, even when the first one's job already finished before the second
 * ticks. One schedule failing to enqueue
 * does not skip the rest; the failures are thrown together afterwards.
 */
export async function tickSchedules(
  enqueue: Enqueue,
  schedules: readonly ScheduleDefinition[],
  at: Date
): Promise<void> {
  const errors: unknown[] = []
  for (const schedule of dueSchedules(schedules, at)) {
    try {
      await enqueue(schedule.job, schedule.payload, {
        dedupeKey: scheduleKey(schedule.name, at),
        dedupeAnyStatus: true,
      })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, "schedules failed to enqueue")
}
