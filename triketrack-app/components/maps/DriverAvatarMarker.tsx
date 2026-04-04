import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

type DriverAvatarMarkerProps = {
  heading: unknown;
  profileName: string;
  profileImageUri: string | null;
};

export function DriverAvatarMarker({
  heading: _heading,
  profileName: _profileName,
  profileImageUri: _profileImageUri,
}: DriverAvatarMarkerProps) {
  return (
    <View style={styles.wrap} collapsable={false} renderToHardwareTextureAndroid>
      <Svg width={82} height={106} viewBox="0 0 82 106">
        <Defs>
          <LinearGradient id="pinFill" x1="18" y1="10" x2="59" y2="82" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#A9EEFF" />
            <Stop offset="0.44" stopColor="#73DEFF" />
            <Stop offset="1" stopColor="#3CC6F8" />
          </LinearGradient>
          <LinearGradient id="pinShade" x1="46" y1="22" x2="63" y2="86" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#2CB7EF" stopOpacity="0.06" />
            <Stop offset="1" stopColor="#189ED9" stopOpacity="0.34" />
          </LinearGradient>
          <LinearGradient id="pinHighlight" x1="21" y1="13" x2="39" y2="52" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M41 9C25.1 9 12.2 21.62 12.2 37.19C12.2 60.08 34.95 80.81 38.67 84.12C40.01 85.32 41.99 85.32 43.33 84.12C47.05 80.81 69.8 60.08 69.8 37.19C69.8 21.62 56.9 9 41 9Z"
          fill="url(#pinFill)"
        />
        <Path
          d="M41 9C25.1 9 12.2 21.62 12.2 37.19C12.2 60.08 34.95 80.81 38.67 84.12C40.01 85.32 41.99 85.32 43.33 84.12C47.05 80.81 69.8 60.08 69.8 37.19C69.8 21.62 56.9 9 41 9Z"
          fill="url(#pinShade)"
        />
        <Path
          d="M41 9C25.1 9 12.2 21.62 12.2 37.19C12.2 60.08 34.95 80.81 38.67 84.12C40.01 85.32 41.99 85.32 43.33 84.12C47.05 80.81 69.8 60.08 69.8 37.19C69.8 21.62 56.9 9 41 9Z"
          stroke="#EAF9FF"
          strokeWidth="3.6"
        />
        <Path
          d="M41 9C25.1 9 12.2 21.62 12.2 37.19C12.2 60.08 34.95 80.81 38.67 84.12C40.01 85.32 41.99 85.32 43.33 84.12C47.05 80.81 69.8 60.08 69.8 37.19C69.8 21.62 56.9 9 41 9Z"
          stroke="#7FE2FF"
          strokeWidth="1.6"
        />
        <Path
          d="M24.5 17.8C17.14 23.25 14 31.39 14 39.44C14 54.27 26.47 67.94 37.37 76.6"
          stroke="url(#pinHighlight)"
          strokeWidth="7.6"
          strokeLinecap="round"
        />
        <Path
          d="M52.4 15.5C61.83 20.32 67.1 29.65 67.1 40.82C67.1 57.67 56.38 72.7 45.11 82.03C53.52 72.95 60.83 61.1 60.83 46.17C60.83 29.25 48.47 15.68 31.36 13.7C38.65 11.66 46.16 12.21 52.4 15.5Z"
          fill="#24ABEA"
          opacity="0.18"
        />

        <Circle cx="41" cy="35" r="18.2" fill="#FFFFFF" />
        <Circle cx="41" cy="35" r="18.2" stroke="#D7F3FF" strokeWidth="2" />

        <G fill="#31424B">
          <Circle cx="41" cy="29.2" r="4" />
          <Path d="M41 34.7C36.45 34.7 32.74 38.39 32.74 42.95C32.74 43.58 33.25 44.09 33.88 44.09H48.12C48.75 44.09 49.26 43.58 49.26 42.95C49.26 38.39 45.55 34.7 41 34.7Z" />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 82,
    height: 106,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
