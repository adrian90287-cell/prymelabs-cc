export const DEPARTMENT_WAITLISTS = ['Health & Wellness', 'Beauty & Grooming', 'Apparel & Gear']

export function canJoinDepartmentWaitlist(department) {
  const value = String(department || '').trim()
  return value.length >= 2 && value.length <= 80 && value !== 'Peptides'
}

export async function ensureDepartmentWaitlistTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS department_waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      notified_at INTEGER,
      UNIQUE(department, email)
    )
  `).run()
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_department_waitlist_department ON department_waitlist(department, notified_at)').run()
}
