// LOG's main deliverables. Each one is countable ("30 videos") and goes through ordered steps: every step of a
// unit has to be planned before the next one (script before filming, filming before editing).
// Admins can rename these or add more in Admin → Task types.
export type TaskTypeSeed = { name: string; unit: string | null; unitPlural: string | null; icon: string; color: string; description: string; stages: string[] };

export const TASK_TYPES: TaskTypeSeed[] = [
  { name: "Videos Social Media", unit: "video", unitPlural: "videos", icon: "clapperboard", color: "#f97316", description: "Reels and social videos.", stages: ["Script writing", "Filming", "Editing"] },
  { name: "Statics Social Media", unit: "static", unitPlural: "statics", icon: "image", color: "#ec4899", description: "Feed posts, carousels and stories.", stages: ["Content creation", "Designs"] },
  { name: "Videos Ads", unit: "video ad", unitPlural: "video ads", icon: "megaphone", color: "#3b82f6", description: "Video ads for paid campaigns.", stages: ["Creative brief", "Scripts", "Filming", "Editing"] },
  { name: "Statics Ads", unit: "static ad", unitPlural: "static ads", icon: "palette", color: "#a855f7", description: "Static ads for paid campaigns.", stages: ["Creative brief", "Content", "Designs"] },
];
