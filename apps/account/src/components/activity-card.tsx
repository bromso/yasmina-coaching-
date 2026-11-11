import type { WorkspaceActivityPage } from "@repo/api-contract"
import { WORKSPACE_ACTIVITY_ACTIONS } from "@repo/api-contract/workspace-activity"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import { NativeSelect } from "@repo/ui/components/native-select"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { SettingsCard } from "@/components/settings-card"
import {
  ACTION_KEYS,
  ACTIVITY_ACTION_PARAM,
  ACTIVITY_HEADING_ID,
  type ActivityParams,
  activityHref,
  activitySentence,
  actorLabel,
} from "@/lib/activity"
import type { AccountT } from "@/lib/i18n"
import { conjunction } from "@/lib/invite-domains"

const FILTER_ID = "activity-action"

/**
 * The Workspace page's **Activity** card (admin and up; the page renders nothing below that).
 * A server component with no client code: the filter is a plain GET form and the paging links
 * plain links, so all of it works without JavaScript. The cursor only ever pages toward older
 * entries, so the way back is **Newest** (the first page, filter kept), never "Newer".
 */
export function ActivityCard({
  page,
  params,
  locale,
}: {
  /** One page of `workspaces.activity.list`; null when it could not be read. */
  page: WorkspaceActivityPage | null
  /** The filter and cursor this page was read with. */
  params: ActivityParams
  locale: Locale
}) {
  // The sentences and filter options are looked up by keys built at runtime (one per action), which
  // next-intl's literal-key typing cannot follow; `lib/activity.ts` takes the plain signature.
  const t = useTranslations("account") as unknown as AccountT
  const formatList = conjunction(useFormatter())
  const newest = params.cursor ? activityHref({ action: params.action }) : undefined
  const older = page?.nextCursor
    ? activityHref({ action: params.action, cursor: page.nextCursor })
    : undefined

  return (
    <SettingsCard
      title={t("activity.title")}
      titleId={ACTIVITY_HEADING_ID}
      description={t("activity.description")}
    >
      <form
        method="get"
        action={`/workspace#${ACTIVITY_HEADING_ID}`}
        className="flex flex-wrap items-end gap-3 px-6 py-4"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={FILTER_ID}>{t("activity.filterLabel")}</Label>
          <NativeSelect
            className="w-auto"
            id={FILTER_ID}
            name={ACTIVITY_ACTION_PARAM}
            defaultValue={params.action ?? ""}
          >
            <option value="">{t("activity.filterAll")}</option>
            {WORKSPACE_ACTIVITY_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`activity.filters.${ACTION_KEYS[action]}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          {t("activity.filterSubmit")}
        </Button>
      </form>

      {page === null ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("activity.unavailable")}</p>
      ) : page.items.length === 0 ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("activity.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {page.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium break-words">{actorLabel(item.actor, t)}</span>
                  {item.actor.kind === "member" && item.actor.email && (
                    <span className="text-muted-foreground break-all">{item.actor.email}</span>
                  )}
                  {item.actor.kind === "member" && item.actor.bySupport && (
                    <Badge variant="outline">{t("activity.bySupport")}</Badge>
                  )}
                </p>
                <p className="text-muted-foreground break-words">
                  {activitySentence(item, t, formatList)}
                </p>
              </div>
              <time dateTime={item.at} className="text-muted-foreground shrink-0 text-xs sm:pt-0.5">
                {formatUtcDate(item.at, locale, { time: true })}
              </time>
            </li>
          ))}
        </ul>
      )}

      {(newest || older) && (
        <nav aria-label={t("activity.pages")} className="flex flex-wrap gap-x-6 gap-y-2 px-6 py-3">
          {newest && (
            <Link
              href={newest}
              prefetch={false}
              className="text-foreground text-sm underline underline-offset-4"
            >
              {t("activity.newest")}
            </Link>
          )}
          {older && (
            <Link
              href={older}
              prefetch={false}
              className="text-foreground text-sm underline underline-offset-4"
            >
              {t("activity.older")}
            </Link>
          )}
        </nav>
      )}
    </SettingsCard>
  )
}
