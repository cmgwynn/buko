export type LocalDateString = string;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatLocalDate(date = new Date()): LocalDateString {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDateString(value: string): value is LocalDateString {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  return formatLocalDate(parseParts(year, month, day)) === value;
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !isValidDateString(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2100;
}

export function assertDateString(value: string): LocalDateString {
  if (!isValidDateString(value)) throw new RangeError(`Invalid local calendar date: ${value}`);
  return value;
}

export function parseLocalDate(value: string): Date {
  assertDateString(value);
  const [year, month, day] = value.split('-').map(Number);
  return parseParts(year, month, day);
}

function parseParts(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date;
}

export function addLocalDays(value: string, days: number): LocalDateString {
  assertDateString(value);
  if (!Number.isInteger(days)) throw new RangeError('Day offset must be an integer.');
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function mondayOfWeek(value: string): LocalDateString {
  const date = parseLocalDate(value);
  const day = date.getDay();
  return addLocalDays(value, day === 0 ? -6 : 1 - day);
}

export function weekDates(value: string): LocalDateString[] {
  const monday = mondayOfWeek(value);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
}

export function monthRange(value: string): { start: LocalDateString; end: LocalDateString } {
  const date = parseLocalDate(value);
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: formatLocalDate(parseParts(year, month + 1, 1)),
    end: formatLocalDate(parseParts(year, month + 2, 0)),
  };
}

export function addLocalMonths(value: string, months: number): LocalDateString {
  assertDateString(value);
  if (!Number.isInteger(months)) throw new RangeError('Month offset must be an integer.');
  const date = parseLocalDate(value);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = parseParts(date.getFullYear(), date.getMonth() + 2, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return formatLocalDate(date);
}

export function localDateStartIso(value: string): string {
  return parseLocalDate(value).toISOString();
}
