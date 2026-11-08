// The real LOG team. Edit names/emails here (or later in Admin → Users) and re-run `npm run provision-users`.
// Teams list their members by email.

export type RosterEntry = {
  name: string;
  email: string;
  role: "ADMIN" | "ACCOUNT_MANAGER" | "PERFORMANCE_MANAGER" | "PRODUCTION_MANAGER" | "EMPLOYEE" | "SOCIAL_MEDIA_SPECIALIST" | "EXTERNAL";
  department: "MANAGEMENT" | "ACCOUNTS" | "PERFORMANCE" | "PRODUCTION";
  title: string;
  color: string;
  /** May create personal clients nobody else can see (the founder only). */
  privateClients?: boolean;
};

export const ROSTER: RosterEntry[] = [
  { name: "Mostafa Makady", email: "m.makady@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Founder", color: "#c8382a", privateClients: true },
  { name: "Omar", email: "omar@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Administrator", color: "#0ea5e9" },
  { name: "Mahmoud", email: "mahmoud@lotsofgrowthgroup.com", role: "ADMIN", department: "MANAGEMENT", title: "Administrator", color: "#10b981" },
  { name: "Rawan", email: "rawan@lotsofgrowthgroup.com", role: "ACCOUNT_MANAGER", department: "ACCOUNTS", title: "Account Manager · Content creator", color: "#7c3aed" },
  { name: "Ahmed", email: "ahmed@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "ACCOUNTS", title: "Editor", color: "#f97316" },
  { name: "Ashraf", email: "ashraf@lotsofgrowthgroup.com", role: "EMPLOYEE", department: "ACCOUNTS", title: "Designer", color: "#ec4899" },
  { name: "Production Team", email: "production.manager@lotsofgrowthgroup.com", role: "PRODUCTION_MANAGER", department: "PRODUCTION", title: "Production", color: "#f59e0b" },
  { name: "Performance Team", email: "performance.manager@lotsofgrowthgroup.com", role: "PERFORMANCE_MANAGER", department: "PERFORMANCE", title: "Performance", color: "#06b6d4" },
];

/** Teams and who is in them. The manager leads the team; members are listed by email. */
export const TEAMS: { name: string; department: RosterEntry["department"]; managerEmail: string; members: string[] }[] = [
  { name: "Rawan's team", department: "ACCOUNTS", managerEmail: "rawan@lotsofgrowthgroup.com", members: ["rawan@lotsofgrowthgroup.com", "ahmed@lotsofgrowthgroup.com", "ashraf@lotsofgrowthgroup.com"] },
  { name: "Production Team", department: "PRODUCTION", managerEmail: "production.manager@lotsofgrowthgroup.com", members: ["production.manager@lotsofgrowthgroup.com"] },
  { name: "Performance Team", department: "PERFORMANCE", managerEmail: "performance.manager@lotsofgrowthgroup.com", members: ["performance.manager@lotsofgrowthgroup.com"] },
];
