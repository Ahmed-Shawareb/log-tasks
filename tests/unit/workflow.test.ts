import { describe, expect, it } from "vitest";
import { canTransition, dropIntent } from "@/lib/workflow";
import { isOverdue, pct } from "@/lib/utils";
import { zonedParts, zonedToUtc } from "@/lib/time";

describe("workflow state machine", () => {
  const manager = { canManage: true, isAssignee: false };
  const assignee = { canManage: false, isAssignee: true };
  const outsider = { canManage: false, isAssignee: false };

  it("lets the assignee start, block and withdraw — nothing more", () => {
    expect(canTransition("READY", "IN_PROGRESS", assignee)).toBe(true);
    expect(canTransition("IN_PROGRESS", "BLOCKED", assignee)).toBe(true);
    expect(canTransition("SUBMITTED", "IN_PROGRESS", assignee)).toBe(true);
    expect(canTransition("IN_PROGRESS", "CANCELLED", assignee)).toBe(false);
    expect(canTransition("APPROVED", "IN_PROGRESS", assignee)).toBe(false);
  });

  it("never allows reaching review states through a generic move", () => {
    expect(canTransition("IN_PROGRESS", "SUBMITTED", manager)).toBe(false);
    expect(canTransition("SUBMITTED", "APPROVED", manager)).toBe(false);
    expect(canTransition("BACKLOG", "APPROVED", manager)).toBe(false);
  });

  it("denies people with no relationship to the task", () => {
    expect(canTransition("READY", "IN_PROGRESS", outsider)).toBe(false);
  });

  it("maps Kanban drops to the right action", () => {
    expect(dropIntent("IN_PROGRESS", "SUBMITTED", { ...assignee, canReview: false }).kind).toBe("submit");
    expect(dropIntent("SUBMITTED", "APPROVED", { ...manager, canReview: true }).kind).toBe("review");
    expect(dropIntent("SUBMITTED", "APPROVED", { ...assignee, canReview: false }).kind).toBe("denied");
    expect(dropIntent("READY", "IN_PROGRESS", { ...assignee, canReview: false }).kind).toBe("move");
  });
});

describe("metrics helpers", () => {
  it("pct never divides by zero", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
  });
  it("overdue is derived from deadline + state, not stored", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isOverdue({ dueAt: past, status: "IN_PROGRESS" })).toBe(true);
    expect(isOverdue({ dueAt: past, status: "APPROVED" })).toBe(false);
    expect(isOverdue({ dueAt: null, status: "IN_PROGRESS" })).toBe(false);
  });
});

describe("timezone helpers", () => {
  it("round-trips wall-clock time in Africa/Cairo", () => {
    const d = zonedToUtc(2026, 11, 3, 9, 30, "Africa/Cairo");
    const z = zonedParts(d, "Africa/Cairo");
    expect([z.year, z.month, z.day, z.hour, z.minute]).toEqual([2026, 11, 3, 9, 30]);
  });
});
