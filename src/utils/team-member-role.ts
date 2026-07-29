/** Normaliza rol de miembro del equipo (tabla TenantAdmin / API agents). */
export function normalizeTeamMemberRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "agent") {
    return "collaborator";
  }
  return normalized;
}

export function serializeTeamMemberRole(role: string): string {
  return normalizeTeamMemberRole(role);
}
