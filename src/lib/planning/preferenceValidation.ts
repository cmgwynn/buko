const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeExcludedFoods(values: readonly string[]): string[] {
  if (values.length > 50) throw new Error('Save up to 50 excluded foods.');
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.some((value) => value.length > 80)) throw new Error('Keep each excluded food to 80 characters or fewer.');
  const seen = new Set<string>();
  return normalized.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeExcludedExercises(values: readonly string[]): string[] {
  if (values.length > 200 || values.some((value) => !UUID.test(value))) {
    throw new Error('One or more excluded exercises are invalid.');
  }
  return [...new Set(values)];
}
