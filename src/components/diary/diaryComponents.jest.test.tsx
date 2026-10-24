import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { FoodLogEntry } from '../../types';
import { DiaryHistorySearch } from './DiaryHistorySearch';
import { DiaryTransferSheet } from './DiaryTransferSheet';
import { EntryActionsSheet } from './EntryActionsSheet';
import { diaryRpc, loadFoodFavorites, mirrorDiaryTransfer, previewDayCopy, transferDiary } from '../../lib/diaryActionsClient';
import { randomUUID } from 'expo-crypto';
import { useConfirm } from '../ConfirmProvider';
import { useAuth } from '../../providers/AuthProvider';

jest.mock('../../lib/diaryActionsClient', () => ({
  diaryRpc: jest.fn(),
  loadFoodFavorites: jest.fn(),
  mirrorDiaryTransfer: jest.fn(),
  previewDayCopy: jest.fn(),
  transferDiary: jest.fn(),
}));

jest.mock('../../providers/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../providers/SelectedDateProvider', () => ({
  useSelectedDate: () => ({ setSelectedDate: jest.fn(), today: '2026-05-15' }),
}));
jest.mock('../ConfirmProvider', () => ({ useConfirm: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const Native = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: unknown }) => ReactRuntime.createElement(Native.View, null, children),
  };
});
jest.mock('../date/CalendarSheet', () => {
  const ReactRuntime = require('react');
  const Native = require('react-native');
  return {
    CalendarSheet: ({ visible, onSelect, onClose }: {
    visible: boolean;
    onSelect(date: string): void;
    onClose(): void;
    }) => visible ? ReactRuntime.createElement(
      Native.Pressable,
      { accessibilityRole: 'button', accessibilityLabel: 'Choose transfer date', onPress: () => { onSelect('2026-05-12'); onClose(); } },
      ReactRuntime.createElement(Native.Text, null, 'Choose transfer date'),
    ) : null,
  };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (Component: unknown) => Component },
  ReduceMotion: { System: 'system' },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
}));

const entry: FoodLogEntry = {
  id: 'entry-1',
  user_id: 'user-1',
  logged_on: '2026-05-13',
  meal: 'lunch',
  source: 'usda',
  source_id: 'food-1',
  name: 'Salmon',
  brand: null,
  quantity: 150,
  unit: 'g',
  grams: 150,
  calories: 300,
  protein_g: 30,
  carbs_g: 0,
  fat_g: 18,
  created_at: '2026-05-13T12:00:00.000Z',
};

const rpc = diaryRpc as unknown as jest.Mock<any>;
const favorites = loadFoodFavorites as unknown as jest.Mock<any>;
const transfer = transferDiary as unknown as jest.Mock<any>;
const mirror = mirrorDiaryTransfer as unknown as jest.Mock<any>;
const dayPreview = previewDayCopy as unknown as jest.Mock<any>;
const confirm = jest.fn(async (_options: { title: string; message: string; confirmLabel?: string; destructive?: boolean }) => true);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function historyEntry(id: string, name: string): FoodLogEntry {
  return { ...entry, id, name };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 15, 12));
  jest.mocked(useAuth).mockReturnValue({ session: { user: { id: 'user-1' } } } as never);
  jest.mocked(useConfirm).mockReturnValue(confirm);
  jest.mocked(randomUUID).mockReturnValue('request-id-1');
  confirm.mockReset().mockResolvedValue(true);
  rpc.mockReset();
  favorites.mockReset().mockResolvedValue([]);
  transfer.mockReset();
  mirror.mockReset().mockResolvedValue(null);
  dayPreview.mockReset().mockResolvedValue('Copying the selected day will skip already-present portions.');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DiaryHistorySearch', () => {
  test('submits literal text and exposes the pending search state', async () => {
    const request = deferred<{ rows: FoodLogEntry[] }>();
    rpc.mockReturnValue(request.promise);
    await render(<DiaryHistorySearch />);
    const input = screen.getByLabelText('Search your food history');
    const literal = "salmon ' OR 1=1 --";
    await fireEvent.changeText(input, `  ${literal}  `);
    await fireEvent(input, 'submitEditing', { nativeEvent: { text: literal } });

    expect(rpc).toHaveBeenCalledWith('diary_history_search', { p_query: literal, p_offset: 0 });
    expect(screen.getByText('Loading…')).toBeTruthy();
    await act(async () => request.resolve({ rows: [] }));
    expect(await screen.findByText(`No past entries match "${literal}".`)).toBeTruthy();
  });

  test('shows a recoverable error when a history search fails', async () => {
    rpc.mockRejectedValueOnce(new Error('history service unavailable'));
    await render(<DiaryHistorySearch />);
    await fireEvent.changeText(screen.getByLabelText('Search your food history'), 'salmon');
    await fireEvent.press(screen.getByRole('button', { name: 'Search history' }));

    expect(await screen.findByText('history service unavailable')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('history service unavailable')).toBeNull();
  });

  test('paginates and ignores a stale page after a newer query is submitted', async () => {
    const firstPage = deferred<{ rows: FoodLogEntry[] }>();
    const stalePage = deferred<{ rows: FoodLogEntry[] }>();
    const newerSearch = deferred<{ rows: FoodLogEntry[] }>();
    rpc.mockReturnValueOnce(firstPage.promise).mockReturnValueOnce(stalePage.promise).mockReturnValueOnce(newerSearch.promise);
    await render(<DiaryHistorySearch />);
    const input = screen.getByLabelText('Search your food history');
    await fireEvent.changeText(input, 'salmon');
    await fireEvent.press(screen.getByRole('button', { name: 'Search history' }));
    await act(async () => firstPage.resolve({ rows: Array.from({ length: 21 }, (_, i) => historyEntry(`salmon-${i}`, `Salmon ${i}`)) }));

    await fireEvent.press(screen.getByRole('button', { name: 'More history' }));
    await fireEvent.changeText(input, 'tuna');
    await fireEvent.press(screen.getByRole('button', { name: 'Search history' }));
    await act(async () => newerSearch.resolve({ rows: [historyEntry('tuna-1', 'Tuna')] }));
    expect(await screen.findByText('Tuna')).toBeTruthy();

    await act(async () => stalePage.resolve({ rows: [historyEntry('stale-1', 'Stale salmon result')] }));
    expect(screen.queryByText('Stale salmon result')).toBeNull();
    expect(screen.getByText('Tuna')).toBeTruthy();
    expect(rpc).toHaveBeenNthCalledWith(2, 'diary_history_search', { p_query: 'salmon', p_offset: 20 });
  });
});

describe('EntryActionsSheet', () => {
  test('loads and toggles a food favorite', async () => {
    rpc.mockResolvedValue(undefined);
    await render(<EntryActionsSheet entry={entry} onClose={jest.fn()} onTransfer={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Favorite this food' }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Favorite this food' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove food from favorites' })).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith('diary_favorite', {
      p_entry: entry.id,
      p_enabled: true,
      p_expected_user_id: 'user-1',
    });
  });

  test('offers move and copy actions for the selected entry', async () => {
    const onTransfer = jest.fn();
    await render(<EntryActionsSheet entry={entry} onClose={jest.fn()} onTransfer={onTransfer} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Favorite this food' }).props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Move to another meal or day' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Copy to another meal or day' }));

    expect(onTransfer).toHaveBeenNthCalledWith(1, 'move', entry);
    expect(onTransfer).toHaveBeenNthCalledWith(2, 'copy', entry);
  });
});

describe('DiaryTransferSheet', () => {
  test('confirmation cancellation leaves the diary unchanged', async () => {
    confirm.mockResolvedValue(false);
    await render(<DiaryTransferSheet selection={{ entry, mode: 'copy' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(transfer).not.toHaveBeenCalled();
  });

  test('previews a day copy for the selected destination before asking for confirmation', async () => {
    const pendingPreview = deferred<string>();
    dayPreview.mockReturnValue(pendingPreview.promise);
    confirm.mockResolvedValue(false);
    await render(<DiaryTransferSheet selection={{ sourceDate: '2026-05-14', mode: 'day' }} onClose={jest.fn()} onSaved={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    expect(dayPreview).toHaveBeenCalledWith('user-1', '2026-05-14', '2026-05-15');
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => pendingPreview.resolve('One entry will be skipped.'));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Copy logged food?',
      message: 'One entry will be skipped.',
      confirmLabel: 'Copy food',
    })));
    expect(transfer).not.toHaveBeenCalled();
  });

  test('locks out duplicate confirmation prompts and dismissal while confirmation is pending', async () => {
    const pending = deferred<boolean>();
    confirm.mockReturnValue(pending.promise);
    const onClose = jest.fn();
    await render(<DiaryTransferSheet selection={{ entry, mode: 'copy' }} onClose={onClose} onSaved={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve(false));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(transfer).not.toHaveBeenCalled();
  });

  test('retries a failed transfer with the same request id', async () => {
    transfer.mockRejectedValueOnce(new Error('temporary network failure')).mockResolvedValueOnce({
      changed: 1,
      skipped: 0,
      entries: [],
    });
    const onClose = jest.fn();
    const onSaved = jest.fn();
    await render(<DiaryTransferSheet selection={{ entry, mode: 'copy' }} onClose={onClose} onSaved={onSaved} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    expect(await screen.findByText('Could not change your diary: temporary network failure')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(transfer).toHaveBeenCalledTimes(2);
    expect(transfer.mock.calls[0][1]).toBe('request-id-1');
    expect(transfer.mock.calls[1][1]).toBe('request-id-1');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('1 entry copied'));
  });

  test('committed transfer with a health warning cannot be repeated', async () => {
    transfer.mockResolvedValue({
      changed: 1,
      skipped: 0,
      entries: [{ id: 'new-entry', health_external_id: null }],
    });
    mirror.mockResolvedValue('Health app sync failed.');
    const onClose = jest.fn();
    const onSaved = jest.fn();
    await render(<DiaryTransferSheet selection={{ entry, mode: 'copy' }} onClose={onClose} onSaved={onSaved} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Review copy' }));
    expect(await screen.findByText(/Do not repeat the action to retry health synchronization/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review copy' })).toBeNull();
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('Health app sync failed.'));
    expect(onClose).not.toHaveBeenCalled();
    expect(transfer).toHaveBeenCalledTimes(1);
  });
});
