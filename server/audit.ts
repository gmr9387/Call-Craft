import { dbOrNull } from "./db.js";

// The activity log: who did what (invites, resets, changes to people, classes, call flows,
// and settings), shown to admins on the System page.

export interface ActivityEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
}

// Records one action. Never throws: a logging problem must not block the action itself.
export async function logActivity(actor: { id: string; name: string }, action: string, target: string): Promise<void> {
  const sql = dbOrNull();
  if (!sql) return;
  try {
    await sql`
      insert into audit_log (actor_id, actor_name, action, target)
      values (${actor.id}, ${actor.name}, ${action}, ${target.slice(0, 300)})
    `;
  } catch (error) {
    console.error("Writing the activity log failed:", error);
  }
}

export async function recentActivity(limit = 200): Promise<ActivityEntry[]> {
  const sql = dbOrNull();
  if (!sql) return [];
  const rows = await sql`
    select at, actor_name, action, target from audit_log order by at desc, id desc limit ${limit}
  `;
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    actor: r.actor_name,
    action: r.action,
    target: r.target,
  }));
}
