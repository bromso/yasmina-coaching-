import { isEnvEnabled } from "../env"
import {
  analyticsEventJob,
  analyticsForwardJob,
  analyticsPruneJob,
  analyticsRollupJob,
} from "./builtin/analytics"
import { applicationsPruneJob } from "./builtin/applications"
import { auditPruneJob } from "./builtin/audit"
import { backupRunJob } from "./builtin/backup"
import { sendMailJob } from "./builtin/mail"
import { notificationsPruneJob } from "./builtin/notifications"
import { privacyExportJob, privacyExportPruneJob, privacyPurgeJob } from "./builtin/privacy"
import { jobsPruneJob, tokensPruneJob } from "./builtin/prune"
import { storageDeleteJob, storageSweepJob } from "./builtin/storage"
import { telemetryForwardJob, telemetryPruneJob } from "./builtin/telemetry"
import { webhookDeliverJob, webhooksPruneJob } from "./builtin/webhooks"
import { defineSchedule, type JobDefinition, type ScheduleDefinition } from "./define"

// biome-ignore lint/suspicious/noExplicitAny: a registry of every job's definition, each with its own payload type — a single array type cannot express that without erasing it.
export const JOBS: readonly JobDefinition<any>[] = [
  sendMailJob,
  storageDeleteJob,
  storageSweepJob,
  telemetryForwardJob,
  telemetryPruneJob,
  tokensPruneJob,
  jobsPruneJob,
  analyticsEventJob,
  analyticsForwardJob,
  analyticsRollupJob,
  analyticsPruneJob,
  privacyExportJob,
  privacyExportPruneJob,
  privacyPurgeJob,
  applicationsPruneJob,
  backupRunJob,
  auditPruneJob,
  webhookDeliverJob,
  webhooksPruneJob,
  notificationsPruneJob,
]

export const SCHEDULES: readonly ScheduleDefinition[] = [
  defineSchedule({ name: "tokens.prune", cron: "0 * * * *", job: tokensPruneJob, payload: {} }),
  defineSchedule({
    name: "telemetry.prune",
    cron: "5 * * * *",
    job: telemetryPruneJob,
    payload: {},
  }),
  defineSchedule({ name: "jobs.prune", cron: "15 3 * * *", job: jobsPruneJob, payload: {} }),
  // On by default; STORAGE_SWEEP_ENABLED=false pauses it (after a restore, until the bucket and
  // the database agree again) without stopping the worker.
  defineSchedule({
    name: "storage.sweep",
    cron: "30 3 * * *",
    job: storageSweepJob,
    payload: {},
    enabled: () => isEnvEnabled(Bun.env.STORAGE_SWEEP_ENABLED, true),
  }),
  defineSchedule({
    name: "analytics.rollup",
    cron: "10 0 * * *",
    job: analyticsRollupJob,
    payload: {},
  }),
  defineSchedule({
    name: "analytics.prune",
    cron: "20 0 * * *",
    job: analyticsPruneJob,
    payload: {},
  }),
  defineSchedule({
    name: "privacy.export.prune",
    cron: "40 3 * * *",
    job: privacyExportPruneJob,
    payload: {},
  }),
  defineSchedule({ name: "privacy.purge", cron: "25 * * * *", job: privacyPurgeJob, payload: {} }),
  defineSchedule({
    name: "applications.prune",
    cron: "50 3 * * *",
    job: applicationsPruneJob,
    payload: {},
  }),
  // Off by default: BACKUP_ENABLED is read on every tick rather than at import time (the process's
  // env is still fixed at start, so in production turning it on or off means a restart).
  // jobByName/the admin's dead-job list still know the job either way — only the schedule is gated.
  defineSchedule({
    name: "backup.run",
    cron: "0 2 * * *",
    job: backupRunJob,
    payload: {},
    enabled: () => isEnvEnabled(Bun.env.BACKUP_ENABLED),
  }),
  defineSchedule({ name: "audit.prune", cron: "45 3 * * *", job: auditPruneJob, payload: {} }),
  defineSchedule({
    name: "webhooks.prune",
    cron: "55 3 * * *",
    job: webhooksPruneJob,
    payload: {},
  }),
  defineSchedule({
    name: "notifications.prune",
    cron: "5 4 * * *",
    job: notificationsPruneJob,
    payload: {},
  }),
]

export function jobByName(name: string): JobDefinition<unknown> | undefined {
  return JOBS.find((job) => job.name === name)
}
