export const FEEDBACK_CATEGORIES = [
  { key: 'bug', label: 'Something broke' },
  { key: 'confusing', label: 'Confusing' },
  { key: 'idea', label: 'Idea' },
  { key: 'praise', label: 'I like this' },
] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]['key'];

export function feedbackProblem(message: string): string | null {
  const length = message.trim().length;
  if (length < 3) return 'Tell us a little more (at least 3 characters).';
  if (length > 2000) return 'Keep feedback under 2,000 characters.';
  return null;
}

export const isMissingTable = (error: { code?: string; message?: string } | null | undefined) =>
  !!error && (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message ?? ''));

export function shouldRecordUse(lastDay: string | null, today: string, optedOut: boolean): boolean {
  return !optedOut && lastDay !== today;
}

export function feedbackMailto(email: string, category: FeedbackCategory, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Buko feedback: ${category}`)}&body=${encodeURIComponent(message.trim())}`;
}
