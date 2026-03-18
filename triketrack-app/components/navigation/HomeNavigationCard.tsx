import { Platform, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useMemo, useState } from 'react';

export type BottomTab = 'home' | 'route' | 'trip' | 'violation' | 'profile';

type HomeNavigationCardProps = {
  activeTab?: BottomTab;
  onNavigate?: (tab: BottomTab) => void;
  showCenterRoute?: boolean;
  styles: Record<string, any>;
};

export function HomeNavigationCard({
  activeTab = 'home',
  onNavigate,
  showCenterRoute = true,
  styles,
}: HomeNavigationCardProps) {
  const insets = useSafeAreaInsets();
  const basePaddingBottom = Platform.OS === 'android' ? 10 : 20;
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const iconColor = (tab: BottomTab) => (activeTab === tab ? '#57c7a8' : '#9AA0A6');
  const textStyle = (tab: BottomTab) =>
    activeTab === tab ? styles.homeBottomTextActive : styles.homeBottomText;
  const slotStyle = showCenterRoute ? styles.homeBottomSlot : styles.homeBottomSlotNoCenter;

  const backgroundPath = useMemo(() => {
    if (!layout) return null;

    const w = layout.width;
    const h = layout.height;
    const r = 24;
    const notchCenterY = 25;

    const rect = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h} H 0 V ${r} Q 0 0 ${r} 0 Z`;

    if (!showCenterRoute) {
      return { d: rect, fillRule: 'nonzero' as const };
    }

    // Cut out a semicircle notch so the map/background shows around the center Route button.
    // The extra 5px is the "transparent border" thickness around the button.
    const notchRadius = 36 + 6;
    const cx = w / 2;
    const cy = notchCenterY;
    const circle = `M ${cx + notchRadius} ${cy}
      A ${notchRadius} ${notchRadius} 0 1 0 ${cx - notchRadius} ${cy}
      A ${notchRadius} ${notchRadius} 0 1 0 ${cx + notchRadius} ${cy} Z`;

    return { d: `${rect} ${circle}`, fillRule: 'evenodd' as const };
  }, [layout, showCenterRoute]);

  return (
    <View
      style={[styles.homeBottomNav, { paddingBottom: basePaddingBottom + (insets.bottom || 0) }]}
      onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {layout && backgroundPath ? (
        <Svg
          pointerEvents="none"
          width={layout.width}
          height={layout.height}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        >
          <Path d={backgroundPath.d} fill="#FFFFFF" fillRule={backgroundPath.fillRule} />
        </Svg>
      ) : null}
      <View style={slotStyle}>
        <Pressable style={styles.homeBottomItem} onPress={() => onNavigate?.('home')}>
          <View
            style={[
              styles.homeBottomActiveLine,
              activeTab === 'home' && styles.homeBottomActiveLineVisible,
            ]}
          />
          <Feather name="home" size={18} color={iconColor('home')} />
          <Text style={textStyle('home')}>Home</Text>
        </Pressable>
      </View>
      <View style={slotStyle}>
        <Pressable style={styles.homeBottomItem} onPress={() => onNavigate?.('trip')}>
          <View
            style={[
              styles.homeBottomActiveLine,
              activeTab === 'trip' && styles.homeBottomActiveLineVisible,
            ]}
          />
          <Feather name="map" size={18} color={iconColor('trip')} />
          <Text style={textStyle('trip')}>Trip</Text>
        </Pressable>
      </View>
      {showCenterRoute ? (
        <View style={styles.homeBottomCenterSlot}>
          <Pressable style={styles.homeCenterRouteButton} onPress={() => onNavigate?.('route')}>
            <Feather name="navigation" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}
      <View style={slotStyle}>
        <Pressable style={styles.homeBottomItem} onPress={() => onNavigate?.('violation')}>
          <View
            style={[
              styles.homeBottomActiveLine,
              activeTab === 'violation' && styles.homeBottomActiveLineVisible,
            ]}
          />
          <Feather name="alert-octagon" size={18} color={iconColor('violation')} />
          <Text style={textStyle('violation')}>Violation</Text>
        </Pressable>
      </View>
      <View style={slotStyle}>
        <Pressable style={styles.homeBottomItem} onPress={() => onNavigate?.('profile')}>
          <View
            style={[
              styles.homeBottomActiveLine,
              activeTab === 'profile' && styles.homeBottomActiveLineVisible,
            ]}
          />
          <Feather name="user" size={18} color={iconColor('profile')} />
          <Text style={textStyle('profile')}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}
