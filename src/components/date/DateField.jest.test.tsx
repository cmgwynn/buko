import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateField } from './DateField';

jest.mock('../../providers/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));

test('dates are picked from the calendar, with a year jump and limits', async () => {
  const onChange = jest.fn();
  await render(<DateField label="Birthday" value="" onChange={onChange} openTo="1996-10-15" minDate="1925-10-31" maxDate="2008-10-30" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Birthday: not set. Opens calendar' }));
  await fireEvent.press(screen.getByRole('button', { name: /October 1996, choose year/ }));
  expect(screen.queryByRole('button', { name: 'Year 2009' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Year 1990' }));
  await fireEvent.press(screen.getByRole('button', { name: /October 12, 1990/ }));
  expect(onChange).toHaveBeenCalledWith('1990-10-12');
  expect(screen.queryByTestId('date-calendar-sheet')).toBeNull();
});

test('dates outside the allowed range cannot be chosen', async () => {
  const onChange = jest.fn();
  await render(<DateField label="Start" value="2026-11-02" onChange={onChange} minDate="2026-11-01" />);
  expect(screen.getByRole('button', { name: /^Start: Mon, Nov 2, 2026/ })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /^Start:/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await fireEvent.press(screen.getByRole('button', { name: /October 20, 2026/ }));
  expect(onChange).not.toHaveBeenCalled();
});
