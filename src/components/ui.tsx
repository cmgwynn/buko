import { Ionicons } from '@expo/vector-icons';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, radius, shadow, spacing, typography } from '../theme';

export function Screen({
  children, scroll = true, edges = ['top'], padded = true, variant = 'content',
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  padded?: boolean;
  variant?: 'content' | 'form';
}) {
  const { width, height } = useWindowDimensions();
  const pad = padded ? styles.screenPad : null;
  const content = [
    styles.screenContent,
    { maxWidth: variant === 'form' ? layout.formMaxWidth : layout.contentMaxWidth },
    pad,
    padded && width >= 600 && { padding: spacing.xl },
    padded && height < 500 && { paddingVertical: spacing.md },
  ];
  return (
    <SafeAreaView style={styles.screen} edges={[...new Set([...edges, 'left', 'right'] as const)]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[...content, { paddingBottom: spacing.xxl * 2 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, ...content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const columnWidth = width >= 320 * 2 + spacing.lg ? (width - spacing.lg) / 2 : '100%';
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg }}>
      {Children.map(children, (child) => child == null ? null : (
        <View style={{ width: columnWidth, minWidth: 0 }}>{child}</View>
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const Title = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={typography.title}>{children}</Text>;
export const Heading = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={typography.heading}>{children}</Text>;
export const Body = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text style={muted ? typography.small : typography.body}>{children}</Text>
);
export const Label = ({ children }: { children: ReactNode }) => <Text style={[typography.label, { marginBottom: spacing.xs }]}>{children}</Text>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({
  style, disabled, onPressIn, onPressOut, ...props
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 1 : scale.value }],
  }));
  const animate = (value: number) => {
    scale.value = withSpring(value, { damping: 22, stiffness: 320, reduceMotion: ReduceMotion.System });
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      style={[style, animatedStyle]}
      onPressIn={(event) => { if (!disabled) animate(0.98); onPressIn?.(event); }}
      onPressOut={(event) => { animate(1); onPressOut?.(event); }}
    />
  );
}

export function Button({
  title, onPress, variant = 'primary', loading, disabled, icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  const off = disabled || loading;
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={off}
      style={[
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && { backgroundColor: colors.primarySoft },
        variant === 'danger' && { backgroundColor: colors.dangerSoft },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        off && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: spacing.sm }} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </MotionPressable>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[styles.input, focused && { borderColor: colors.primary, backgroundColor: colors.surface }, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? <Text style={[typography.small, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <MotionPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[typography.body, selected && { color: colors.onPrimary, fontWeight: '600' }]}>{label}</Text>
    </MotionPressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Notice({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info'; children: ReactNode }) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'info' ? colors.primarySoft : colors.warningSoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'info' ? colors.primary : colors.warning;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Ionicons name={tone === 'info' ? 'information-circle' : 'warning'} size={20} color={fg} style={{ marginRight: spacing.sm, marginTop: 1 }} />
      <Text style={[typography.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function Empty({ icon, text }: { icon: ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={[styles.center, { paddingVertical: spacing.xxl }]}>
      <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[typography.small, { maxWidth: 280, marginTop: spacing.md, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { width: '100%', alignSelf: 'center' },
  screenPad: { padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginVertical: spacing.xs },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16, color: colors.text,
  },
  chip: {
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notice: { flexDirection: 'row', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
