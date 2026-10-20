import { Linking, Pressable, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

const link = (url: string) => () => Linking.openURL(url);

/** Data-source attribution (required by Open Food Facts' terms; courtesy for USDA). */
export function Attribution({ usda }: { usda?: boolean }) {
  return (
    <View style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
      <Text style={[typography.small, { textAlign: 'center' }]}>
        Product data from{' '}
        <Text style={{ color: colors.primary }} onPress={link('https://world.openfoodfacts.org')}>
          Open Food Facts
        </Text>{' '}
        (ODbL), contributed by its community.
        {usda ? (
          <>
            {' '}Whole-food data from{' '}
            <Text style={{ color: colors.primary }} onPress={link('https://fdc.nal.usda.gov')}>
              USDA FoodData Central
            </Text>
            .
          </>
        ) : null}
      </Text>
    </View>
  );
}

export function SourceLink({ name, url }: { name: string; url: string }) {
  return (
    <Pressable onPress={link(url)} accessibilityRole="link">
      <Text style={[typography.small, { color: colors.primary, textDecorationLine: 'underline' }]}>Source: {name}</Text>
    </Pressable>
  );
}
