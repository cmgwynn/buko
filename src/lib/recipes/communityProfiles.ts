/** Mirrors the database rules in migration 0011 so members see problems before saving. */
const RESERVED = /(^|[^a-z])(buko|admin|administrator|moderator|official|support|staff)([^a-z]|$)/;

export function validatePublicAlias(value: string): { alias: string | null; error: string | null } {
  const alias = value.trim();
  if (!alias) return { alias: null, error: null };
  if (alias.length < 3 || alias.length > 30) return { alias, error: 'Use 3-30 characters.' };
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*[A-Za-z0-9]$/.test(alias) || alias.includes('  ')) {
    return { alias, error: 'Use letters, numbers, single spaces, dots, dashes or underscores. Email addresses are not allowed.' };
  }
  if (RESERVED.test(alias.toLowerCase())) return { alias, error: 'Avoid official-sounding names such as Buko, moderator or support.' };
  return { alias, error: null };
}

export function contributorLabel(userId: string, aliases: Record<string, string>): string {
  return aliases[userId] ?? `Member ${userId.slice(0, 8)}`;
}
