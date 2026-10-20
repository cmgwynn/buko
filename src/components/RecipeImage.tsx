import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { signedPhotoUrl } from '../lib/recipes/db';
import { colors, radius } from '../theme';

/** A recipe photo from private storage (via a short-lived signed URL), or a calm placeholder. */
export function RecipeImage({ path, localUri, style }: { path: string | null; localUri?: string | null; style?: StyleProp<ViewStyle> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (path && !localUri) signedPhotoUrl(path).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [path, localUri]);
  const uri = localUri ?? url;
  return (
    <View style={[{ backgroundColor: colors.primarySoft, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Recipe photo" />
      ) : (
        <Ionicons name="restaurant-outline" size={28} color={colors.primary} />
      )}
    </View>
  );
}
