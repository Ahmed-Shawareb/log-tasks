"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/server/permissions";

export type CreateDefaults = {
  projectId?: string; parentId?: string; department?: string; assigneeId?: string; dueAt?: string; title?: string; templateId?: string;
};

type Ctx = {
  user: SessionUser;
  isManager: boolean;
  isAdmin: boolean;
  openTask: (idOrNumber: string | number) => void;
  closeTask: () => void;
  openTaskId: string | null;
  openCreate: (defaults?: CreateDefaults) => void;
  closeCreate: () => void;
  createDefaults: CreateDefaults | null;
  /** Increments after any mutation so open views refetch. */
  dataVersion: number;
  invalidate: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createDefaults, setCreateDefaults] = useState<CreateDefaults | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);
  const value = useMemo<Ctx>(() => ({
    user,
    isManager: user.role !== "EMPLOYEE",
    isAdmin: user.role === "ADMIN",
    openTask: (id) => setOpenTaskId(String(id)),
    closeTask: () => setOpenTaskId(null),
    openTaskId,
    openCreate: (d) => setCreateDefaults(d ?? {}),
    closeCreate: () => setCreateDefaults(null),
    createDefaults,
    dataVersion,
    invalidate,
  }), [user, openTaskId, createDefaults, dataVersion, invalidate]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
