"use client"

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { Icon } from "@repo/ui/components/icon"
import { useImageFallback } from "@repo/ui/components/image-fallback"
import { initialsOf } from "@repo/ui/lib/initials"
import { useState } from "react"

export type UserMenuWorkspaces = {
  items: { id: number; name: string; logoUrl?: string | null }[]
  currentId: number | null
  /** A server action reading the submitted `workspaceId`. */
  switchTo: (formData: FormData) => Promise<void>
  pendingInvitations: number
  newUrl: string
  manageUrl: string
  /** Whether the current workspace's role may manage members; the app decides. */
  canManage: boolean
}

/** The menu's words, in the page's language; English by default. */
export type UserMenuLabels = {
  /**
   * The trigger's whole accessible name ("Account menu for Ada, 1 pending invitation"): the app
   * builds it with its own plural rules. Without it the English sentence is built here.
   */
  trigger?: string
  workspace: string
  noWorkspace: string
  createWorkspace: string
  manageMembers: string
  invitations: string
  account: string
  signOut: string
}

const ENGLISH: UserMenuLabels = {
  workspace: "Workspace",
  noWorkspace: "No workspace yet",
  createWorkspace: "Create a workspace",
  manageMembers: "Manage members",
  invitations: "Invitations",
  account: "Account",
  signOut: "Sign out",
}

export type UserMenuProps = {
  user: { name: string; email: string; avatarUrl?: string | null }
  accountUrl: string
  /** A server action; passed from the app so the menu stays app-agnostic. */
  signOut: () => Promise<void>
  /** The workspace switcher; without it the menu shows only who, Account and Sign out. */
  workspaces?: UserMenuWorkspaces
  /** Appended to the label — e.g. "(impersonating)" — so the menu says whose session this is. */
  note?: string
  labels?: UserMenuLabels
}

/** Avatar trigger opening the signed-in user's menu: who, workspaces, Account, Sign out. */
export function UserMenu(props: UserMenuProps) {
  const { user, workspaces } = props
  const label = props.note ? `${user.name || user.email} ${props.note}` : user.name || user.email
  const pending = workspaces?.pendingInvitations ?? 0
  const [open, setOpen] = useState(false)
  const avatar = useImageFallback(user.avatarUrl)
  const showAvatar = Boolean(user.avatarUrl) && !avatar.failed
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Avatar className="size-8" aria-hidden="true">
            {showAvatar ? (
              // A plain <img>, not Radix's AvatarImage: that component only swaps in once an
              // off-DOM preload confirms the src loads (an effect that never runs in SSR or in
              // bun test's no-DOM environment), so it would never appear in server-rendered
              // markup. `useImageFallback` gives the same "stale upload → initials" fallback
              // (a removed avatar on a page rendered before the removal) while staying
              // SSR-visible, and also catches a 404 that resolves before hydration attaches
              // `onError` (its mount effect re-checks the element's own loaded state).
              <img
                ref={avatar.ref}
                src={user.avatarUrl ?? undefined}
                alt=""
                width={32}
                height={32}
                className="aspect-square size-full object-cover"
                onError={avatar.onError}
              />
            ) : (
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {initialsOf(user)}
              </AvatarFallback>
            )}
          </Avatar>
          {pending > 0 && (
            <span
              aria-hidden="true"
              className="bg-destructive ring-background absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2"
            />
          )}
          <span className="sr-only">
            {props.labels?.trigger ??
              (pending > 0
                ? `Account menu for ${label}, ${pending} pending invitation${pending === 1 ? "" : "s"}`
                : `Account menu for ${label}`)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <UserMenuItems {...props} onSwitched={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A workspace's switcher entry: its logo, or a one-letter tile. A component of its own (rather
 * than inline in the `.map` below) so `useImageFallback` — a hook — can run once per item.
 */
function WorkspaceLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const logo = useImageFallback(logoUrl)
  if (logoUrl && !logo.failed) {
    return (
      <img
        ref={logo.ref}
        src={logoUrl}
        width={16}
        height={16}
        alt=""
        className="size-4 rounded-sm object-cover"
        onError={logo.onError}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** The open menu's items; rendered inside `DropdownMenuContent` (exported for tests). */
export function UserMenuItems({
  user,
  accountUrl,
  signOut,
  workspaces,
  note,
  labels = ENGLISH,
  onSwitched,
}: UserMenuProps & {
  /** Called once a workspace switch has finished; `UserMenu` closes itself with it. */
  onSwitched?: () => void
}) {
  const label = note ? `${user.name || user.email} ${note}` : user.name || user.email
  const switchTo = workspaces
    ? async (formData: FormData) => {
        await workspaces.switchTo(formData)
        onSwitched?.()
      }
    : undefined
  return (
    <>
      <DropdownMenuLabel className="flex flex-col">
        <span className="truncate">{label}</span>
        {user.name && (
          <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
        )}
      </DropdownMenuLabel>
      {workspaces && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {labels.workspace}
          </DropdownMenuLabel>
          {workspaces.items.map((w) => (
            <form key={w.id} action={switchTo}>
              <input type="hidden" name="workspaceId" value={w.id} />
              {/* Kept open until the switch lands, as Sign out is: closing first would unmount
                  the form before its submit fires. */}
              <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                <button
                  type="submit"
                  className="w-full text-left"
                  aria-current={w.id === workspaces.currentId ? "true" : undefined}
                >
                  <WorkspaceLogo name={w.name} logoUrl={w.logoUrl} />
                  <span className="truncate">{w.name}</span>
                  {w.id === workspaces.currentId && (
                    <Icon icon="lucide:check" className="ml-auto size-4" aria-hidden />
                  )}
                </button>
              </DropdownMenuItem>
            </form>
          ))}
          {workspaces.items.length === 0 && (
            <DropdownMenuItem disabled>{labels.noWorkspace}</DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a href={workspaces.newUrl}>{labels.createWorkspace}</a>
          </DropdownMenuItem>
          {workspaces.canManage && (
            <DropdownMenuItem asChild>
              <a href={workspaces.manageUrl}>{labels.manageMembers}</a>
            </DropdownMenuItem>
          )}
          {workspaces.pendingInvitations > 0 && (
            <DropdownMenuItem asChild>
              <a href={workspaces.newUrl}>
                {/* One text node, as the literal it replaced: the server markup stays the same. */}
                {`${labels.invitations} `}
                <Badge className="ml-auto">{workspaces.pendingInvitations}</Badge>
              </a>
            </DropdownMenuItem>
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <a href={accountUrl}>{labels.account}</a>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <form action={signOut}>
        {/* Keep the menu open: closing it unmounts the form before the submit lands, unless an
            exit animation happens to hold it in the DOM. The action's redirect closes it. */}
        <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
          <button type="submit" className="w-full text-left">
            {labels.signOut}
          </button>
        </DropdownMenuItem>
      </form>
    </>
  )
}
