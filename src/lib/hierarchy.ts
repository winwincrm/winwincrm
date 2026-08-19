export type AppRole = "admin" | "superiormanager" | "manager" | "agent";

export const ROLE_RANK: Record<AppRole, number> = {
  admin: 4,
  superiormanager: 3,
  manager: 2,
  agent: 1,
};

/** Normalize the retired database/UI name without letting it leak through the app. */
export function normalizeRole(value: string | null | undefined): AppRole | null {
  if (value === "supervisor") return "superiormanager";
  if (
    value === "admin" ||
    value === "superiormanager" ||
    value === "manager" ||
    value === "agent"
  ) {
    return value;
  }
  return null;
}

export function highestRole(values: Iterable<string>): AppRole | null {
  let result: AppRole | null = null;
  for (const value of values) {
    const role = normalizeRole(value);
    if (role && (!result || ROLE_RANK[role] > ROLE_RANK[result])) result = role;
  }
  return result;
}

export function isOfficeManagerRole(role: AppRole | null | undefined): boolean {
  return role === "manager" || role === "superiormanager";
}

/** The hierarchy is intentionally strict: Admin > Superior Manager > Manager > Agent. */
export function requiredParentRole(role: AppRole): AppRole | null {
  if (role === "manager") return "superiormanager";
  if (role === "agent") return "manager";
  return null;
}

export function rolesCreatableBy(role: AppRole | null): AppRole[] {
  if (role === "admin") return ["admin", "superiormanager", "manager", "agent"];
  if (role === "superiormanager") return ["manager", "agent"];
  if (role === "manager") return ["agent"];
  return [];
}

export function canManageRole(caller: AppRole | null, target: AppRole | null): boolean {
  return !!caller && !!target && ROLE_RANK[caller] > ROLE_RANK[target];
}
