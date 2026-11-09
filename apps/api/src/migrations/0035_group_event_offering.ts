import type { Migration } from "../migrate"

// A group event belongs to an offering (`group` or `inner_group`, see GROUP_OFFERING_KEYS). The
// default keeps every existing row the plain group; no rows are written here.
const groupEventOffering: Migration = {
  name: "0035_group_event_offering",
  async up(sql) {
    await sql.unsafe("ALTER TABLE group_events ADD COLUMN offering TEXT NOT NULL DEFAULT 'group'")
    await sql.unsafe(
      "CREATE INDEX group_events_offering ON group_events (offering, status, starts_at)"
    )
  },
}

export default groupEventOffering
