import { Ionicons } from '@expo/vector-icons';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
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

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  return <View style={[styles.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>;
}

/** Dark, high-contrast summary surface for a screen's single most important number or action. */
export function HeroCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.hero, style]}>{children}</View>;
}

export const Eyebrow = ({ children, onHero }: { children: ReactNode; onHero?: boolean }) => (
  <Text style={[typography.eyebrow, onHero && { color: colors.onHeroMuted }]}>{children}</Text>
);

/** Numbered section header for multi-step forms such as the plan generators. */
export const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm }}>
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>{n}</Text>
    </View>
    <Text style={typography.subheading}>{children}</Text>
  </View>
);

/** Prominent call to action for the personal plan generators. */
export function HeroCta({ eyebrow, title, body, action, icon, onPress, disabled, children }: {
  eyebrow: string; title: string; body: string; action: string; icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void; disabled?: boolean; children?: ReactNode;
}) {
  return <HeroCard>
    <Eyebrow onHero>{eyebrow}</Eyebrow>
    <Text accessibilityRole="header" style={[typography.heading, { color: colors.onHero, marginTop: spacing.xs }]}>{title}</Text>
    <Text style={[typography.small, { color: colors.onHeroMuted, marginTop: spacing.xs, marginBottom: spacing.md }]}>{body}</Text>
    {children}
    <Button title={action} icon={icon} variant="accent" disabled={disabled} onPress={onPress} />
  </HeroCard>;
}

export const Title = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={typography.title}>{children}</Text>;
export const Heading = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={typography.heading}>{children}</Text>;
export const Body = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text style={muted ? typography.small : typography.body}>{children}</Text>
);
export const Label = ({ children }: { children: ReactNode }) => <Text style={[typography.label, { marginBottom: spacing.xs }]}>{children}</Text>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({
  style, disabled, onPressIn, onPressOut, onFocus, onBlur, focusColor = colors.primary, ...props
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; focusColor?: string }) {
  const scale = useSharedValue(1);
  const [focused, setFocused] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: disabled ? 1 : scale.value }],
  }));
  const animate = (value: number) => {
    scale.value = withSpring(value, { damping: 22, stiffness: 320, reduceMotion: ReduceMotion.System });
  };

  return (
    <AnimatedPressable
      {...props}
      aria-checked={props['aria-checked'] ?? props.accessibilityState?.checked}
      aria-selected={props['aria-selected'] ?? props.accessibilityState?.selected}
      aria-expanded={props['aria-expanded'] ?? props.accessibilityState?.expanded}
      aria-busy={props['aria-busy'] ?? props.accessibilityState?.busy}
      aria-disabled={props['aria-disabled'] ?? disabled ?? props.accessibilityState?.disabled}
      disabled={disabled}
      style={[style, animatedStyle, Platform.OS === 'web' && focused && { outlineColor: focusColor, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' }]}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  const off = disabled || loading;
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'accent' ? colors.hero : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={off}
      focusColor={variant === 'accent' ? colors.onHero : undefined}
      style={[
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'secondary' && { backgroundColor: colors.primarySoft },
        variant === 'danger' && { backgroundColor: colors.dangerSoft },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        variant === 'accent' && { backgroundColor: colors.heroAccent },
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
        accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        style={[styles.input, focused && { borderColor: colors.primary, backgroundColor: colors.surface }, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? <Text style={[typography.small, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, disabled, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <MotionPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={[styles.chip, selected && { backgroundColor: colors.hero, borderColor: colors.hero }, disabled && { opacity: 0.5 }]}
    >
      <Text style={[typography.body, { fontWeight: '500' }, selected && { color: colors.onHero, fontWeight: '700' }]}>{label}</Text>
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
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'} style={[styles.notice, { backgroundColor: bg }]}>
      <Ionicons name={tone === 'info' ? 'information-circle' : 'warning'} size={20} color={fg} style={{ marginRight: spacing.sm, marginTop: 1 }} />
      <Text style={[typography.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }} aria-busy accessibilityLiveRegion="polite" style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[typography.small, { marginTop: spacing.sm }]}>Loading…</Text>
    </View>
  );
}

export function NavigationRow({ title, subtitle, icon, onPress }: {
  title: string; subtitle?: string; icon?: ComponentProps<typeof Ionicons>['name']; onPress(): void;
}) {
  return (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={{
      minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }}>
      {icon ? <Ionicons name={icon} size={22} color={colors.primary} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={typography.body}>{title}</Text>
        {subtitle ? <Text style={typography.small}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </MotionPressable>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <View>
    <MotionPressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <Text style={[typography.subheading, { flex: 1 }]}>{title}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
    </MotionPressable>
    {open ? children : null}
  </View>;
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
  hero: {
    backgroundColor: colors.hero,
    borderRadius: radius.lg + 4,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadow.elevated,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginVertical: spacing.xs },
  buttonText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16, color: colors.text,
  },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.xs },
  notice: { flexDirection: 'row', padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
