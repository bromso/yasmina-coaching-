import {
  type ApiKeySummary,
  type Entitlements,
  type Invitation,
  type Member,
  type Role,
  roleAtLeast,
  seatsLeft,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WorkspaceActivityPage,
  type WorkspaceSecurity,
  type WorkspaceSummary,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { initialsOf } from "@repo/ui/lib/initials"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { removeLogo, setLogo } from "@/app/(account)/workspace/actions"
import { ActivityCard } from "@/components/activity-card"
import { ApiKeysCard } from "@/components/api-keys-card"
import { DangerZone } from "@/components/danger-zone"
import { ImageUploadCard } from "@/components/image-upload-card"
import { InvitationsList } from "@/components/invitations-list"
import { InviteDomainsForm } from "@/components/invite-domains-form"
import { InviteForm } from "@/components/invite-form"
import { MembersList } from "@/components/members-list"
import { SettingsCard } from "@/components/settings-card"
import { WebhooksCard } from "@/components/webhooks-card"
import { WorkspaceNameForm } from "@/components/workspace-name-form"
import { WorkspaceSecurityCard } from "@/components/workspace-security-card"
import type { ActivityParams } from "@/lib/activity"
import { apiKeysGate } from "@/lib/api-keys"
import { API_KEYS_HEADING_ID } from "@/lib/api-keys-focus"
import { conjunction, displayDomains, outsideInvitationIds } from "@/lib/invite-domains"
import { seatsLine } from "@/lib/plans"
import { webhooksGate } from "@/lib/webhooks"
import { WEBHOOKS_HEADING_ID } from "@/lib/webhooks-focus"

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-4 px-6 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  )
}

export function WorkspaceView({
  workspace,
  role,
  entitlements,
  currentUserId,
  members,
  invitations,
  apiKeys,
  webhooks,
  deliveriesByEndpoint,
  activity,
  security,
  isImpersonating = false,
  locale,
  apiKeysDocsUrl,
  webhooksDocsUrl,
}: {
  workspace: WorkspaceSummary
  role: Role
  /** The plan's limits, as `requireWorkspace()` returned them. */
  entitlements: Entitlements
  currentUserId: number
  members: Member[]
  /** Only read for admins and owners; undefined below admin. */
  invitations?: Invitation[]
  /** Only read for admins and owners (on every plan: a Free workspace's keys stay revocable);
   * undefined below admin. */
  apiKeys?: ApiKeySummary[]
  /** Only read for admins and owners (on every plan: a Free workspace's endpoints stay
   * deletable); undefined below admin. */
  webhooks?: WebhookEndpoint[]
  /** Each listed endpoint's recent deliveries, pre-fetched; undefined below admin. */
  deliveriesByEndpoint?: Record<number, WebhookDelivery[]>
  /** The Activity card's page (null when it could not be read) and the filter and cursor it was
   * read with; only read for admins and owners, undefined below admin (the card is absent). */
  activity?: { page: WorkspaceActivityPage | null; params: ActivityParams }
  /** `workspaces.security.get`: only read for admins and owners, undefined below admin (the card
   * then shows the workspace summary's own `requireTwoFactor`, without the count). */
  security?: WorkspaceSecurity
  isImpersonating?: boolean
  /** The page's language, for the dates in the lists (client components, so passed down). */
  locale: Locale
  /** `${siteUrl("docs")}/developers/authentication`, computed server-side in `page.tsx` — the
   * card itself is a Client Component and must never import `@repo/sites`. */
  apiKeysDocsUrl: string
  /** `${siteUrl("docs")}/developers/webhooks`, computed the same way. */
  webhooksDocsUrl: string
}) {
  const t = useTranslations("account.workspace")
  const tPlans = useTranslations("account.plans")
  const tDomains = useTranslations("account.inviteDomains")
  const tSecurity = useTranslations("account.workspaceSecurity")
  const tInvite = useTranslations("account.invite")
  const formatList = conjunction(useFormatter())
  const isAdmin = roleAtLeast(role, "admin")
  // The same function `page.tsx` uses to decide whether to fetch the list, so the two can never
  // disagree about who gets it.
  const apiKeysSection = apiKeysGate(role, entitlements)
  const webhooksSection = webhooksGate(role, entitlements)
  // The member list was just read; count it rather than trust an older summary.
  const seats = { ...entitlements, seatsUsed: members.length }
  // The allowed invitation domains (admins and up read them): stored as A-labels, shown in their
  // Unicode form and as one list in the page's language — both done here, on the server.
  const inviteDomains = security?.inviteDomains ?? []
  const shownDomains = displayDomains(inviteDomains)
  const domainsList = shownDomains.length > 0 ? formatList(shownDomains) : undefined

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro", { name: workspace.name })}</p>
      </div>

      <SettingsCard title={t("card")}>
        {isAdmin && <WorkspaceNameForm name={workspace.name} workspaceId={workspace.id} />}
        <dl className="flex flex-col divide-y">
          {!isAdmin && <Detail label={t("name")}>{workspace.name}</Detail>}
          <Detail label={t("slug")}>{workspace.slug}</Detail>
          <Detail label={t("yourRole")}>{t("youAre", { role })}</Detail>
        </dl>
      </SettingsCard>

      <SettingsCard title={t("logo")}>
        <ImageUploadCard
          kind="logo"
          url={workspace.logoUrl}
          fallback={initialsOf({ name: workspace.name, email: workspace.slug })}
          workspaceId={workspace.id}
          readOnly={!isAdmin}
          readOnlyNote={t("logoReadOnly")}
          setAction={setLogo}
          removeAction={removeLogo}
        />
      </SettingsCard>

      <SettingsCard
        title={t("members")}
        description={t(isAdmin ? "membersAdmin" : "membersViewer", {
          seats: seatsLine(seats, tPlans),
        })}
      >
        <MembersList
          members={members}
          currentUserId={currentUserId}
          role={role}
          workspaceId={workspace.id}
          locale={locale}
        />
      </SettingsCard>

      {isAdmin && (
        <SettingsCard title={t("invitations")} description={t("invitationsDescription")}>
          <InvitationsList
            items={invitations ?? []}
            workspaceId={workspace.id}
            locale={locale}
            outside={outsideInvitationIds(inviteDomains, invitations ?? [])}
          />
          <InviteForm
            workspaceId={workspace.id}
            full={seatsLeft(seats) === 0}
            limitedTo={
              domainsList === undefined ? undefined : tInvite("limitedTo", { domains: domainsList })
            }
          />
        </SettingsCard>
      )}

      <SettingsCard title={t("security")} description={t("securityDescription")}>
        <WorkspaceSecurityCard
          workspaceId={workspace.id}
          role={role}
          requireTwoFactor={security?.requireTwoFactor ?? workspace.requireTwoFactor}
          membersWithoutTwoFactor={security?.membersWithoutTwoFactor}
          isImpersonating={isImpersonating}
        />
        {/* Invitation domains: the owner edits them; an admin (or support acting as the owner)
            reads them; below admin, nothing. */}
        {role === "owner" && !isImpersonating ? (
          <InviteDomainsForm workspaceId={workspace.id} domains={shownDomains} />
        ) : (
          isAdmin && (
            <div className="grid gap-1 border-t px-6 py-4 text-sm">
              <h3 className="font-medium">{tDomains("title")}</h3>
              <p className="text-muted-foreground wrap-anywhere">
                {domainsList ?? tDomains("any")}
              </p>
              {/* Who can change it, worded as the two-step section above words it. */}
              <p className="text-muted-foreground">
                {isImpersonating && role === "owner"
                  ? tSecurity("impersonating")
                  : tSecurity("ownerOnly")}
              </p>
            </div>
          )
        )}
      </SettingsCard>

      <SettingsCard
        title={t("apiKeys")}
        titleId={API_KEYS_HEADING_ID}
        description={t("apiKeysDescription")}
      >
        {apiKeysSection === "membersOnly" ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">{t("apiKeysMembersNote")}</p>
        ) : apiKeysSection === "upsell" ? (
          <>
            {/* Keys from before a downgrade: listed and revocable, never creatable here. */}
            {apiKeys && apiKeys.length > 0 && (
              <>
                <ApiKeysCard
                  apiKeys={apiKeys}
                  workspaceId={workspace.id}
                  isImpersonating={isImpersonating}
                  canCreate={false}
                  locale={locale}
                  docsUrl={apiKeysDocsUrl}
                />
                <p className="text-muted-foreground border-t px-6 py-4 text-sm">
                  {t("apiKeysPaused")}
                </p>
              </>
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 text-sm">
              <span className="text-muted-foreground">{t("apiKeysUpsell")}</span>
              <Link href="/payments" className="text-foreground underline underline-offset-4">
                {t("apiKeysUpsellPlans")}
              </Link>
            </p>
          </>
        ) : (
          <ApiKeysCard
            apiKeys={apiKeys ?? []}
            workspaceId={workspace.id}
            isImpersonating={isImpersonating}
            locale={locale}
            docsUrl={apiKeysDocsUrl}
          />
        )}
      </SettingsCard>

      <SettingsCard
        title={t("webhooks")}
        titleId={WEBHOOKS_HEADING_ID}
        description={t("webhooksDescription")}
      >
        {webhooksSection === "membersOnly" ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">{t("webhooksMembersNote")}</p>
        ) : webhooksSection === "upsell" ? (
          <>
            {/* Endpoints from before a downgrade: listed, deliveries readable and deletable,
                never editable, rotatable, testable or creatable here. */}
            {webhooks && webhooks.length > 0 && (
              <>
                <WebhooksCard
                  endpoints={webhooks}
                  deliveriesByEndpoint={deliveriesByEndpoint ?? {}}
                  workspaceId={workspace.id}
                  isImpersonating={isImpersonating}
                  canManage={false}
                  locale={locale}
                  docsUrl={webhooksDocsUrl}
                />
                <p className="text-muted-foreground border-t px-6 py-4 text-sm">
                  {t("webhooksPaused")}
                </p>
              </>
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 text-sm">
              <span className="text-muted-foreground">{t("webhooksUpsell")}</span>
              <Link href="/payments" className="text-foreground underline underline-offset-4">
                {t("webhooksUpsellPlans")}
              </Link>
            </p>
          </>
        ) : (
          <WebhooksCard
            endpoints={webhooks ?? []}
            deliveriesByEndpoint={deliveriesByEndpoint ?? {}}
            workspaceId={workspace.id}
            isImpersonating={isImpersonating}
            locale={locale}
            docsUrl={webhooksDocsUrl}
          />
        )}
      </SettingsCard>

      {isAdmin && activity && (
        <ActivityCard page={activity.page} params={activity.params} locale={locale} />
      )}

      {role === "owner" && (
        <SettingsCard title={t("dangerZone")} description={t("dangerZoneDescription")}>
          <DangerZone
            name={workspace.name}
            workspaceId={workspace.id}
            others={members.filter((m) => m.userId !== currentUserId && m.role !== "owner")}
          />
        </SettingsCard>
      )}
    </div>
  )
}
