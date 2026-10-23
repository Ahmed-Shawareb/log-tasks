// The real LOG team. Edit names/emails here (or later in Admin → Users) and re-run `npm run provision-users`.
// Placeholder names are clearly marked so they are easy to rename.

export type RosterEntry = {
  name: string;
  email: string;
  role: "ADMIN" | "ACCOUNT_MANAGER" | "PERFORMANCE_MANAGER" | "PRODUCTION_MANAGER" | "EMPLOYEE";
  department: "MANAGEMENT" | "ACCOUNTS" | "PERFORMANCE" | "PRODUCTION";
  title: string;
  color: string;
};

export const ROSTER: RosterEntry[] = [
  { name: "Mostafa Makady", email: "m.makady@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Founder", color: "#c8382a" },
  { name: "Omar Hassan", email: "o.hassan@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Managing Partner", color: "#1e4d8f" },
  { name: "Mahmoud", email: "mahmoud@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Administrator", color: "#e11d48" },
  { name: "Rawan", email: "rawan@lotsofgrowthgroup.com", role: "ACCOUNT_MANAGER", department: "ACCOUNTS", title: "Account Manager", color: "#7c3aed" },
  { name: "Performance Manager (rename me)", email: "performance.manager@lotsofgrowthgroup.com", role: "PERFORMANCE_MANAGER", department: "PERFORMANCE", title: "Performance Manager", color: "#06b6d4" },
  { name: "Production Manager (rename me)", email: "production.manager@lotsofgrowthgroup.com", role: "PRODUCTION_MANAGER", department: "PRODUCTION", title: "Production Manager", color: "#f59e0b" },
  { name: "Performance Employee 1 (rename me)", email: "performance.1@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PERFORMANCE", title: "Media Buyer", color: "#22c55e" },
  { name: "Performance Employee 2 (rename me)", email: "performance.2@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PERFORMANCE", title: "SEO Specialist", color: "#14b8a6" },
  { name: "Performance Employee 3 (rename me)", email: "performance.3@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PERFORMANCE", title: "Paid Social Specialist", color: "#3b82f6" },
  { name: "Production Employee 1 (rename me)", email: "production.1@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PRODUCTION", title: "Graphic Designer", color: "#ec4899" },
  { name: "Production Employee 2 (rename me)", email: "production.2@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PRODUCTION", title: "Video Editor", color: "#f97316" },
  { name: "Production Employee 3 (rename me)", email: "production.3@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "PRODUCTION", title: "Copywriter", color: "#a855f7" },
];

export const TEAMS = [
  { name: "Performance Team", department: "PERFORMANCE", managerEmail: "performance.manager@lotsofgrowthgroup.com" },
  { name: "Production Team", department: "PRODUCTION", managerEmail: "production.manager@lotsofgrowthgroup.com" },
] as const;
