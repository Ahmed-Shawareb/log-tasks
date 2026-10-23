"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ROLE_LABEL, type RoleKey } from "@/lib/constants";
import type { Person } from "@/lib/types";
import { Select } from "../ui";

const cache = new Map<string, Promise<Person[]>>();

/** Active people the current user may assign work in `department` to — straight from the server's rules. */
export function useEligible(department: string | null | undefined) {
  const key = department ?? "";
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (!cache.has(key)) cache.set(key, api<Person[]>(`/api/users?eligible=1&department=${encodeURIComponent(key)}`).catch(() => { cache.delete(key); return []; }));
    cache.get(key)!.then((p) => { if (alive) { setPeople(p); setLoading(false); } });
    return () => { alive = false; };
  }, [key]);
  return { people, loading };
}

export function AssigneeSelect({ department, value, onChange, allowNone = true, exclude, id }: {
  department: string | null | undefined; value: string; onChange: (v: string) => void; allowNone?: boolean; exclude?: string | null; id?: string;
}) {
  const { people, loading } = useEligible(department);
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    if (p.id === exclude) continue;
    const g = p.department?.name ?? ROLE_LABEL[p.role as RoleKey];
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
      {allowNone && <option value="">{loading ? "Loading…" : "Unassigned"}</option>}
      {!allowNone && <option value="" disabled>{loading ? "Loading…" : "Choose a person"}</option>}
      {[...groups.entries()].map(([g, ps]) => (
        <optgroup key={g} label={g}>
          {ps.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ""}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

type ProjectOpt = { id: string; name: string; client: { name: string } };
let projectCache: Promise<ProjectOpt[]> | null = null;
export function useProjects() {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  useEffect(() => {
    projectCache ??= api<ProjectOpt[]>("/api/projects").catch(() => { projectCache = null; return []; });
    projectCache.then(setProjects);
  }, []);
  return projects;
}
export const resetPickerCaches = () => { cache.clear(); projectCache = null; };
