// Starter task templates for a marketing agency (used by the seed and by production setup).
import type { Priority } from "@prisma/client";

export const TEMPLATES = [
  {
    name: "Social Media Campaign", description: "Monthly organic + paid social campaign for a client.", department: null, priority: "HIGH" as Priority,
    checklist: ["Client brief confirmed", "Brand guidelines received", "Reporting KPIs agreed"],
    subtasks: [
      { title: "Content calendar", departmentKey: "PRODUCTION", estimateMinutes: 240, offsetDays: 10 },
      { title: "Design post visuals", departmentKey: "PRODUCTION", estimateMinutes: 480, offsetDays: 6 },
      { title: "Write captions & hashtags", departmentKey: "PRODUCTION", estimateMinutes: 180, offsetDays: 6 },
      { title: "Set up paid campaigns", departmentKey: "PERFORMANCE", estimateMinutes: 240, offsetDays: 3 },
      { title: "Weekly performance report", departmentKey: "PERFORMANCE", estimateMinutes: 120, offsetDays: 0 },
    ],
  },
  {
    name: "Paid Ads Launch", description: "Launch a Meta/Google ads campaign.", department: "PERFORMANCE", priority: "HIGH" as Priority,
    checklist: ["Pixel / tag verified", "Budget approved", "Audiences defined", "UTM parameters set"],
    subtasks: [
      { title: "Audience research", departmentKey: "PERFORMANCE", estimateMinutes: 180, offsetDays: 5 },
      { title: "Ad creatives", departmentKey: "PRODUCTION", estimateMinutes: 360, offsetDays: 3 },
      { title: "Campaign build & QA", departmentKey: "PERFORMANCE", estimateMinutes: 240, offsetDays: 1 },
    ],
  },
  {
    name: "Video Production", description: "Script, shoot, edit and deliver a promotional video.", department: "PRODUCTION", priority: "MEDIUM" as Priority,
    checklist: ["Script approved by client", "Music licensed", "Captions added", "Exports in 9:16, 1:1, 16:9"],
    subtasks: [
      { title: "Script & storyboard", departmentKey: "PRODUCTION", estimateMinutes: 240, offsetDays: 7 },
      { title: "Shoot", departmentKey: "PRODUCTION", estimateMinutes: 480, offsetDays: 4 },
      { title: "Edit & color", departmentKey: "PRODUCTION", estimateMinutes: 600, offsetDays: 1 },
    ],
  },
  {
    name: "Landing Page", description: "Conversion-focused landing page.", department: null, priority: "MEDIUM" as Priority,
    checklist: ["Copy approved", "Mobile tested", "Analytics events firing"],
    subtasks: [
      { title: "Wireframe & copy", departmentKey: "PRODUCTION", estimateMinutes: 300, offsetDays: 6 },
      { title: "Visual design", departmentKey: "PRODUCTION", estimateMinutes: 420, offsetDays: 3 },
      { title: "Tracking & CRO setup", departmentKey: "PERFORMANCE", estimateMinutes: 180, offsetDays: 0 },
    ],
  },
];
