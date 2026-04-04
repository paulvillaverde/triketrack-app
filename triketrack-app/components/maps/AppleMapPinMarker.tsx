import { StyleSheet, View } from 'react-native';
import { AppIcon, type AppIconName } from '../ui';

type AppleMapPinMarkerProps = {
  color?: string;
  iconName?: AppIconName;
  iconColor?: string;
  size?: 'sm' | 'md';
};

const SIZE_MAP = {
  sm: {
    width: 30,
    height: 40,
    head: 26,
    pointerHeight: 10,
    dot: 5,
    icon: 11,
    iconWrap: 15,
    border: 1.5,
  },
  md: {
    width: 38,
    height: 52,
    head: 34,
    pointerHeight: 12,
    dot: 6,
    icon: 14,
    iconWrap: 20,
    border: 2,
  },
} as const;

export function AppleMapPinMarker({
  color = '#49C6FF',
  iconName = 'radio',
  iconColor = '#FFFFFF',
  size = 'md',
}: AppleMapPinMarkerProps) {
  const token = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: token.width,
          height: token.height,
        },
      ]}
      renderToHardwareTextureAndroid
    >
      <View
        style={[
          styles.pinShadow,
          {
            width: token.head * 0.86,
            height: token.head * 0.22,
            borderRadius: token.head / 2,
            bottom: 0,
          },
        ]}
      />
      <View
        style={[
          styles.pinBody,
          {
            width: token.head,
            height: token.head,
            borderRadius: token.head / 2,
            borderWidth: token.border,
            backgroundColor: color,
          },
        ]}
      >
        <View
          style={[
            styles.pinDepth,
            {
              width: token.head * 0.9,
              height: token.head * 0.9,
              borderRadius: token.head * 0.45,
            },
          ]}
        />
        <View
          style={[
            styles.pinRim,
            {
              width: token.head * 0.88,
              height: token.head * 0.88,
              borderRadius: token.head * 0.44,
            },
          ]}
        />
        <View
          style={[
            styles.pinHighlight,
            {
              width: token.head * 0.62,
              height: token.head * 0.34,
              borderRadius: token.head * 0.18,
            },
          ]}
        />
        <View
          style={[
            styles.pinHighlightSmall,
            {
              width: token.head * 0.22,
              height: token.head * 0.12,
              borderRadius: token.head * 0.08,
            },
          ]}
        />
        <View
          style={[
            styles.pointerStem,
            {
              width: Math.max(2, token.border),
              height: token.pointerHeight,
              top: token.head * 0.48,
            },
          ]}
        />
        <View
          style={[
            styles.iconWrap,
            {
              width: token.iconWrap,
              height: token.iconWrap,
              borderRadius: token.iconWrap / 2,
            },
          ]}
        >
          <AppIcon name={iconName} size={token.icon} color={iconColor} active />
        </View>
      </View>
      <View
        style={[
          styles.pointerTip,
          {
            width: token.pointerHeight,
            height: token.pointerHeight + 2,
            backgroundColor: color,
            bottom: token.dot + 2,
          },
        ]}
      />
      <View
        style={[
          styles.bottomDot,
          {
            width: token.dot,
            height: token.dot,
            borderRadius: token.dot / 2,
            backgroundColor: color,
            bottom: 0,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pinShadow: {
    position: 'absolute',
    backgroundColor: 'rgba(15,23,42,0.14)',
    transform: [{ scaleX: 1.12 }],
  },
  pinBody: {
    borderColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    shadowColor: '#0F172A',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    overflow: 'hidden',
  },
  pinDepth: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: 'rgba(8,145,178,0.18)',
  },
  pinRim: {
    position: 'absolute',
    top: 1,
    left: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pointerStem: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
  },
  pinHighlight: {
    position: 'absolute',
    top: 3,
    left: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    transform: [{ rotate: '-12deg' }],
  },
  pinHighlightSmall: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.36)',
    transform: [{ rotate: '-12deg' }],
  },
  iconWrap: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  pointerTip: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    borderBottomRightRadius: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  bottomDot: {
    position: 'absolute',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
