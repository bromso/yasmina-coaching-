import type { PresenceMember } from "@repo/api-contract"

/**
 * Who has an event stream open, per workspace, in this process only. Several connections of one
 * user (tabs, devices) are one person: the first connection is a join, the last close a leave.
 * Each replica keeps its own registry and publishes snapshots tagged with its `replicaId`; clients
 * merge the latest snapshot per replica.
 */
export type PresenceRegistry = {
  /** Registers `connectionId` for `member`; true if the user was not present before. */
  join(workspaceId: number, member: PresenceMember, connectionId: string): boolean
  /** Drops `connectionId`; true if it was the user's last connection in the workspace. */
  leave(workspaceId: number, userId: number, connectionId: string): boolean
  /** The workspace's present users, one entry each, in join order. */
  members(workspaceId: number): PresenceMember[]
  /** Workspaces with at least one present user. */
  workspaces(): number[]
}

type Entry = { member: PresenceMember; connections: Set<string> }

export function createPresence(): PresenceRegistry {
  const byWorkspace = new Map<number, Map<number, Entry>>()

  return {
    join(workspaceId, member, connectionId) {
      let users = byWorkspace.get(workspaceId)
      if (!users) {
        users = new Map()
        byWorkspace.set(workspaceId, users)
      }
      const entry = users.get(member.userId)
      if (entry) {
        // The newest connection's name and avatar win (a rename shows on the next connect).
        entry.member = member
        entry.connections.add(connectionId)
        return false
      }
      users.set(member.userId, { member, connections: new Set([connectionId]) })
      return true
    },
    leave(workspaceId, userId, connectionId) {
      const users = byWorkspace.get(workspaceId)
      const entry = users?.get(userId)
      if (!users || !entry) return false
      if (!entry.connections.delete(connectionId)) return false
      if (entry.connections.size > 0) return false
      users.delete(userId)
      if (users.size === 0) byWorkspace.delete(workspaceId)
      return true
    },
    members(workspaceId) {
      return [...(byWorkspace.get(workspaceId)?.values() ?? [])].map((entry) => entry.member)
    },
    workspaces() {
      return [...byWorkspace.keys()]
    },
  }
}
