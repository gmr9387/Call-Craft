import type { ClassInfo } from "./classes.js";

// Admins manage people and see every class. Trainers run their own classes. Agents practice.
export type Role = "admin" | "trainer" | "agent";

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", trainer: "Trainer", agent: "Agent" };

export const MIN_PASSWORD = 8;

// The signed-in person, as the browser sees them.
export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  // The class an agent is in.
  classInfo: ClassInfo | null;
}

export interface AuthStatus {
  user: Me | null;
  // True only before the first (admin) account exists.
  needsSetup: boolean;
  // For trainers and admins: what went wrong if the AI stopped working in the last hour.
  aiProblem?: string | null;
}

// What a one-time link is for, shown before the person uses it.
export interface LinkInfo {
  kind: "invite" | "reset";
  role: Role | null;
  // Set for password resets.
  name: string | null;
  email: string | null;
}

// A row on the admin's People page.
export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
  className: string | null;
  disabled: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}
