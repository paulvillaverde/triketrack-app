import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type TrikeTrackLogoProps = {
  style?: ViewStyle;
  markSize?: number;
  color?: string;
};

export function TrikeTrackLogo({ style, markSize = 110, color = '#FFFFFF' }: TrikeTrackLogoProps) {
  const iconSize = Math.round(markSize * 0.62);

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.mark, { width: markSize, height: markSize }]}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 64 64">
          <Rect
            x="7"
            y="8"
            width="50"
            height="46"
            rx="16"
            ry="16"
            fill="rgba(255,255,255,0.10)"
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="1"
          />

          <Path
            d="M16 44 L26 32 H38 L44 44"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M38 36 H54"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M44 28 H56 V38 H44 Z"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M24 32 L20 26"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M20 26 H15"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          <Circle cx="28" cy="24" r="4.2" stroke={color} strokeWidth="2.2" fill="none" />
          <Path
            d="M28 28 L30.5 32"
            stroke={color}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          <Circle cx="16" cy="44" r="6" stroke={color} strokeWidth="2.6" fill="none" />
          <Circle cx="40" cy="44" r="6" stroke={color} strokeWidth="2.6" fill="none" />
          <Circle cx="54" cy="44" r="6" stroke={color} strokeWidth="2.6" fill="none" />

          {/* Route line + destination pin (combined trike + map route mark) */}
          <Path
            d="M18 18 C24 14, 30 14, 34 18 S42 26, 48 22"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.9"
            strokeDasharray="2.5 4"
          />
          <Path
            d="M48 28 C44.5 25.2 44.5 20.2 48 17.6 C51.5 20.2 51.5 25.2 48 28 Z"
            stroke={color}
            strokeWidth="2.2"
            strokeLinejoin="round"
            fill="none"
          />
          <Circle cx="48" cy="21.2" r="1.7" fill={color} opacity="0.95" />
        </Svg>
      </View>

      <Text style={styles.wordmark}>
        <Text style={[styles.wordmarkLeft, { color }]}>{'Trike'}</Text>
        <Text style={[styles.wordmarkRight, { color }]}>{'Track'}</Text>
      </Text>
      <View style={styles.underline} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  wordmark: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'NissanOpti',
    letterSpacing: 0.2,
  },
  wordmarkLeft: {
    opacity: 0.92,
  },
  wordmarkRight: {
    opacity: 1,
  },
  underline: {
    marginTop: 10,
    width: 56,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
