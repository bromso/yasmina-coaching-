"use client"

import type { PresenceMember } from "@repo/api-contract/realtime"
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { useImageFallback } from "@repo/ui/components/image-fallback"
import { initialsOf } from "@repo/ui/lib/initials"
import { useTranslations } from "next-intl"

function MemberAvatar({ member }: { member: PresenceMember }) {
  const avatar = useImageFallback(member.avatarUrl)
  const showAvatar = Boolean(member.avatarUrl) && !avatar.failed
  return (
    <Avatar className="border-background size-8 border-2" title={member.name}>
      {showAvatar ? (
        // A plain <img>, not Radix's AvatarImage — see user-menu.tsx's identical note: that
        // component only swaps in once an off-DOM preload confirms the src loads, so it would
        // never render in SSR or in bun test's no-DOM environment.
        <img
          ref={avatar.ref}
          src={member.avatarUrl ?? undefined}
          alt=""
          width={32}
          height={32}
          className="aspect-square size-full object-cover"
          onError={avatar.onError}
        />
      ) : (
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
          {/* PresenceMember never carries an email, by design (design doc §2: "never email") — */}
          {/* initialsOf's email fallback only matters for a nameless user, which real accounts */}
          {/* do not have. */}
          {initialsOf({ name: member.name, email: "" })}
        </AvatarFallback>
      )}
    </Avatar>
  )
}

/**
 * Who else has this page open, as an overlapping avatar stack — the viewer's own connection is
 * just another presence member, so a solo visitor still sees "1 person here". Hidden entirely
 * when the merged presence is empty (e.g. before the stream's first snapshot arrives).
 */
export function HereNow({ members }: { members: PresenceMember[] }) {
  const t = useTranslations("app.notes")
  if (members.length === 0) return null
  // An ICU plural: "1 person here" / "3 people here", "1 person här" / "3 personer här".
  const label = t("hereNow", { count: members.length })
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {members.map((member) => (
          <MemberAvatar key={member.userId} member={member} />
        ))}
      </div>
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  )
}
