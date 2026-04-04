import { Image, ImageStyle, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

type AvatarProps = {
  name: string;
  imageUri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const COLOR_PALETTE = [
  '#57c7a8', // green (brand)
  '#0EA5E9', // sky
  '#6366F1', // indigo
  '#F97316', // orange
  '#A855F7', // purple
  '#EF4444', // red
  '#14B8A6', // teal
  '#F59E0B', // amber
];

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickColor(name: string) {
  const idx = hashString(name.trim().toLowerCase() || '?') % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx] ?? '#57c7a8';
}

export function Avatar({ name, imageUri, size, style, textStyle }: AvatarProps) {
  const trimmed = name.trim();
  const initial = (trimmed[0] ?? '?').toUpperCase();
  const backgroundColor = pickColor(trimmed);

  const baseStyle: ViewStyle = size
    ? { width: size, height: size, borderRadius: size / 2 }
    : {};

  const fontSize = size ? Math.max(12, Math.round(size * 0.42)) : 16;
  const flattenedStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
  const resolvedBorderRadius =
    typeof flattenedStyle?.borderRadius === 'number'
      ? flattenedStyle.borderRadius
      : size
        ? size / 2
        : 999;
  const imageStyle: ImageStyle = {
    width: '100%',
    height: '100%',
    borderRadius: resolvedBorderRadius,
  };

  return (
    <View style={[styles.container, baseStyle, { backgroundColor }, style]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={imageStyle} resizeMode="cover" />
      ) : (
        <Text style={[styles.initial, { fontSize }, textStyle]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
});
