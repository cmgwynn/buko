export const HISTORY_PAGE_SIZE = 500;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function loadHistoryPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  isCurrent: () => boolean,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; isCurrent(); from += HISTORY_PAGE_SIZE) {
    const result = await fetchPage(from, from + HISTORY_PAGE_SIZE - 1);
    if (!isCurrent()) return null;
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < HISTORY_PAGE_SIZE) return rows;
  }
  return null;
}
