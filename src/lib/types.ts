import type { TaskDetail, TaskListItem } from "@/server/services/tasks";

/** Shape of server data after JSON serialisation (Dates become strings). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type TaskItem = Jsonify<TaskListItem>;
export type TaskFull = Jsonify<TaskDetail>;

export type Person = {
  id: string; name: string; email: string; role: string; title: string | null; avatarColor: string; isActive: boolean;
  department: { id: string; key: string; name: string; color: string } | null;
  workDays: number[]; workStartMin: number; workEndMin: number; weeklyCapacityMin: number;
};
