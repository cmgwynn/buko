import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

const sources = [
  { key: 'saved', title: 'My recipes', path: '/(tabs)/recipes' },
  { key: 'library', title: 'Buko library', path: '/recipe/library' },
  { key: 'shared', title: 'Shared', path: '/community' },
] as const;

export function RecipeSourceNav({ active }: { active: typeof sources[number]['key'] }) {
  const router = useRouter();
  return (
    <View accessibilityRole="tablist" style={{
      flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, marginBottom: spacing.md,
      borderRadius: radius.lg, backgroundColor: colors.primarySoft,
    }}>
      {sources.map((source) => {
        const selected = source.key === active;
        return (
          <Pressable
            key={source.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => { if (!selected) router.push(source.path); }}
            style={{
              flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.md, paddingHorizontal: spacing.xs,
              backgroundColor: selected ? colors.surface : 'transparent',
            }}
          >
            <Text style={[typography.small, { color: selected ? colors.text : colors.primary, fontWeight: selected ? '700' : '500', textAlign: 'center' }]}>
              {source.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
