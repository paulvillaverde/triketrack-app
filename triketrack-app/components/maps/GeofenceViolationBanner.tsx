import { Animated, StyleSheet, Text, View } from 'react-native';

type GeofenceViolationBannerProps = {
  opacity: Animated.AnimatedInterpolation<number> | number;
  scale: Animated.AnimatedInterpolation<number> | number;
  message: string;
};

export function GeofenceViolationBanner({
  opacity,
  scale,
  message,
}: GeofenceViolationBannerProps) {
  return (
    <Animated.View style={[styles.banner, { opacity, transform: [{ scale }] }]}>
      <View style={styles.dot} />
      <Text style={styles.title}>Geofence Violation Detected</Text>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 118,
    left: 14,
    right: 14,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(220,38,38,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.9)',
  },
  dot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 15,
    color: '#FFFFFF',
  },
  text: {
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#FEE2E2',
  },
});
