// Task workflow state machine — single source of truth for the server and the UI.
import type { StatusKey } from "./constants";

/**
 * Generic status moves. SUBMITTED / APPROVED / CHANGES_REQUESTED are NOT reachable here:
 * they only happen through the dedicated submit and review actions, which record history.
 */
export const TRANSITIONS: Record<StatusKey, StatusKey[]> = {
  BACKLOG: ["READY", "SCHEDULED", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
  READY: ["BACKLOG", "SCHEDULED", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
  SCHEDULED: ["READY", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["READY", "BLOCKED", "ON_HOLD", "CANCELLED"],
  SUBMITTED: ["IN_PROGRESS"], // withdraw submission
  CHANGES_REQUESTED: ["IN_PROGRESS", "BLOCKED", "ON_HOLD", "CANCELLED"],
  APPROVED: ["IN_PROGRESS"], // reopen
  BLOCKED: ["READY", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["BACKLOG", "READY", "IN_PROGRESS", "CANCELLED"],
  CANCELLED: ["BACKLOG"], // restore
};

/** The subset of moves the person doing the work may make on their own task. */
const ASSIGNEE_MOVES: Partial<Record<StatusKey, StatusKey[]>> = {
  BACKLOG: ["IN_PROGRESS"],
  READY: ["IN_PROGRESS"],
  SCHEDULED: ["IN_PROGRESS"],
  IN_PROGRESS: ["BLOCKED"],
  BLOCKED: ["IN_PROGRESS"],
  CHANGES_REQUESTED: ["IN_PROGRESS", "BLOCKED"],
  SUBMITTED: ["IN_PROGRESS"],
};

export type MovePerms = { canManage: boolean; isAssignee: boolean };

export function canTransition(from: StatusKey, to: StatusKey, p: MovePerms) {
  if (from === to) return false;
  if (!TRANSITIONS[from]?.includes(to)) return false;
  if (p.canManage) return true;
  if (p.isAssignee) return ASSIGNEE_MOVES[from]?.includes(to) ?? false;
  return false;
}

export const canSubmit = (status: StatusKey) => status === "IN_PROGRESS" || status === "CHANGES_REQUESTED";
export const canBeReviewed = (status: StatusKey) => status === "SUBMITTED";

/** What a Kanban drop into `to` should do. */
export function dropIntent(from: StatusKey, to: StatusKey, p: MovePerms & { canReview: boolean }):
  | { kind: "move" }
  | { kind: "submit" }
  | { kind: "review"; decision: "APPROVED" | "CHANGES_REQUESTED" }
  | { kind: "denied"; reason: string } {
  if (to === "SUBMITTED") {
    if (p.isAssignee && canSubmit(from)) return { kind: "submit" };
    return { kind: "denied", reason: "Only the assignee can submit work that is in progress." };
  }
  if (to === "APPROVED" || (to === "CHANGES_REQUESTED" && from === "SUBMITTED")) {
    if (p.canReview && canBeReviewed(from)) return { kind: "review", decision: to };
    return { kind: "denied", reason: "Only a reviewer can approve or return work that has been submitted." };
  }
  if (canTransition(from, to, p)) return { kind: "move" };
  return { kind: "denied", reason: "That status change is not allowed for this task." };
}
