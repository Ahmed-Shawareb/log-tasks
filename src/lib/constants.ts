// Shared (client + server) vocabulary. Keep labels here so every screen speaks the same language.

export const ROLES = ["ADMIN", "ACCOUNT_MANAGER", "PERFORMANCE_MANAGER", "PRODUCTION_MANAGER", "EMPLOYEE"] as const;
export type RoleKey = (typeof ROLES)[number];

export const ROLE_LABEL: Record<RoleKey, string> = {
  ADMIN: "Administrator",
  ACCOUNT_MANAGER: "Account Manager",
  PERFORMANCE_MANAGER: "Performance Manager",
  PRODUCTION_MANAGER: "Production Manager",
  EMPLOYEE: "Employee",
};

/** Department a manager role is restricted to. */
export const MANAGER_DEPARTMENT: Partial<Record<RoleKey, string>> = {
  PERFORMANCE_MANAGER: "PERFORMANCE",
  PRODUCTION_MANAGER: "PRODUCTION",
};

export const DEPARTMENTS = [
  { key: "MANAGEMENT", name: "Management", color: "#e11d48" },
  { key: "ACCOUNTS", name: "Account Management", color: "#8b5cf6" },
  { key: "PERFORMANCE", name: "Performance", color: "#06b6d4" },
  { key: "PRODUCTION", name: "Production", color: "#f59e0b" },
] as const;

export const STATUSES = [
  "BACKLOG", "READY", "SCHEDULED", "IN_PROGRESS", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "BLOCKED", "ON_HOLD", "CANCELLED",
] as const;
export type StatusKey = (typeof STATUSES)[number];

export const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  BACKLOG: { label: "Backlog", color: "#64748b" },
  READY: { label: "Ready", color: "#38bdf8" },
  SCHEDULED: { label: "Scheduled", color: "#818cf8" },
  IN_PROGRESS: { label: "In Progress", color: "#a855f7" },
  SUBMITTED: { label: "Submitted for Review", color: "#f59e0b" },
  CHANGES_REQUESTED: { label: "Changes Requested", color: "#f97316" },
  APPROVED: { label: "Approved", color: "#10b981" },
  BLOCKED: { label: "Blocked", color: "#ef4444" },
  ON_HOLD: { label: "On Hold", color: "#94a3b8" },
  CANCELLED: { label: "Cancelled", color: "#475569" },
};

export const CLOSED_STATUSES: StatusKey[] = ["APPROVED", "CANCELLED"];
export const OPEN_STATUSES: StatusKey[] = STATUSES.filter((s) => !CLOSED_STATUSES.includes(s));

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type PriorityKey = (typeof PRIORITIES)[number];
export const PRIORITY_META: Record<PriorityKey, { label: string; color: string; weight: number }> = {
  LOW: { label: "Low", color: "#64748b", weight: 1 },
  MEDIUM: { label: "Medium", color: "#38bdf8", weight: 2 },
  HIGH: { label: "High", color: "#f59e0b", weight: 3 },
  URGENT: { label: "Urgent", color: "#ef4444", weight: 4 },
};

export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export const LEAVE_TYPES = ["VACATION", "SICK", "UNAVAILABLE", "OTHER"] as const;

export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const WEEKDAYS = [
  { iso: 1, short: "Mon" }, { iso: 2, short: "Tue" }, { iso: 3, short: "Wed" }, { iso: 4, short: "Thu" },
  { iso: 5, short: "Fri" }, { iso: 6, short: "Sat" }, { iso: 7, short: "Sun" },
];
