import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';

type DriverVehicleMarkerProps = {
  heading: Animated.AnimatedInterpolation<string> | string;
};

export function DriverVehicleMarker({ heading }: DriverVehicleMarkerProps) {
  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.shadow} />
      <Animated.View
        style={[
          styles.shell,
          {
            transform: [{ rotate: heading }],
          },
        ]}
      >
        <Svg width={64} height={64} viewBox="0 0 64 64">
          <Defs>
            <LinearGradient id="arrowBlue" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#60A5FA" />
              <Stop offset="100%" stopColor="#2563EB" />
            </LinearGradient>
          </Defs>

          <Ellipse
            cx="32"
            cy="32"
            rx="21"
            ry="21"
            fill="#FFFFFF"
            stroke="#D7E2F0"
            strokeWidth="2"
          />

          <Path
            d="M32 14
               L42 35
               L34.75 33
               L32 45
               L29.25 33
               L22 35
               Z"
            fill="url(#arrowBlue)"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  shell: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    width: 30,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.12)',
    bottom: 8,
  },
});
