import { Animated, StyleSheet, View } from 'react-native';
import { Avatar } from '../ui';

type DriverAvatarMarkerProps = {
  heading: Animated.AnimatedInterpolation<string> | string;
  profileName: string;
  profileImageUri: string | null;
};

export function DriverAvatarMarker({
  heading,
  profileName,
  profileImageUri,
}: DriverAvatarMarkerProps) {
  return (
    <View style={styles.wrap} collapsable={false}>
      <Animated.View style={[styles.shell, { transform: [{ rotate: heading }] }]}>
        <View style={styles.shadow} />
        <View style={styles.avatarRing}>
          <Avatar name={profileName} imageUri={profileImageUri} style={styles.avatar} />
        </View>
      </Animated.View>
      <View style={styles.pointer} />
      <View style={styles.pulse} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 58,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  shadow: {
    position: 'absolute',
    width: 28,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.12)',
    bottom: -10,
  },
  avatarRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#2D7DF6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  pointer: {
    marginTop: -6,
    width: 14,
    height: 14,
    backgroundColor: '#2D7DF6',
    transform: [{ rotate: '45deg' }],
    borderBottomLeftRadius: 4,
  },
  pulse: {
    width: 24,
    height: 8,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: 'rgba(45,125,246,0.16)',
  },
});
