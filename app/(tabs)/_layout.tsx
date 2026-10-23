import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../../src/theme';

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        animation: reducedMotion ? 'none' : 'fade',
        tabBarActiveBackgroundColor: colors.primarySoft,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { borderRadius: radius.md, marginHorizontal: 3 },
        tabBarStyle: {
          height: (height < 500 ? 56 : 64) + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingHorizontal: 6,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Diary', tabBarIcon: icon('book-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('barcode-outline') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: icon('barbell-outline') }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes', tabBarIcon: icon('restaurant-outline') }} />
      {/* Grocery moved to a button on the Plan tab; the route stays so the screen and deep links keep working. */}
      <Tabs.Screen name="grocery" options={{ href: null }} />
    </Tabs>
  );
}
