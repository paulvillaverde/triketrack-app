import { Image, ImageStyle, StyleSheet, View, ViewStyle } from 'react-native';

type TrikeTrackLogoProps = {
  style?: ViewStyle;
  markSize?: number;
  imageStyle?: ImageStyle;
};

export function TrikeTrackLogo({ style, markSize = 110, imageStyle }: TrikeTrackLogoProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={require('../../assets/logo.png')}
        style={[styles.mark, { width: markSize, height: markSize }, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    flexShrink: 0,
  },
});
