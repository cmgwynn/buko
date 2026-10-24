import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { colors, layout, radius, spacing, typography } from '../theme';
import { Button } from './ui';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}
type Request = ConfirmOptions & { resolve(value: boolean): void };
const Context = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Request | null>(null);
  const pending = useRef<Request[]>([]);
  const active = useRef<Request | null>(null);
  const finish = useCallback((accepted: boolean) => {
    active.current?.resolve(accepted);
    active.current = pending.current.shift() ?? null;
    setCurrent(active.current);
  }, []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    const request = { ...options, resolve };
    if (active.current) pending.current.push(request);
    else { active.current = request; setCurrent(request); }
  }), []);
  useEffect(() => () => {
    active.current?.resolve(false);
    pending.current.forEach((request) => request.resolve(false));
  }, []);
  return (
    <Context.Provider value={confirm}>
      {children}
      <Modal accessibilityLabel={current?.title} visible={current !== null} transparent animationType="fade" onRequestClose={() => finish(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable accessible={false} focusable={false} onPress={() => finish(false)} style={{ position: 'absolute', inset: 0 }} />
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: layout.formMaxWidth, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl }}>
            <Text accessibilityRole="header" style={typography.heading}>{current?.title}</Text>
            <Text style={[typography.body, { marginVertical: spacing.lg }]}>{current?.message}</Text>
            <Button title="Cancel" variant="ghost" onPress={() => finish(false)} />
            <Button title={current?.confirmLabel ?? 'Confirm'} variant={current?.destructive ? 'danger' : 'primary'} onPress={() => finish(true)} />
          </View>
        </View>
      </Modal>
    </Context.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(Context);
  if (!confirm) throw new Error('useConfirm requires ConfirmProvider.');
  return confirm;
}
