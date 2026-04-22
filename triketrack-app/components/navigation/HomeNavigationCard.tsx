import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useMemo, useState } from 'react';
import { AppIcon } from '../ui';
import {
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../screens/homeScreenShared';

export type BottomTab = 'home' | 'route' | 'trip' | 'violation' | 'profile';

type HomeNavigationCardProps = {
  activeTab?: BottomTab;
  onNavigate?: (tab: BottomTab) => void;
  showCenterRoute?: boolean;
  isLowBatteryMapMode?: boolean;
  styles: Record<string, any>;
};

export function HomeNavigationCard({
  activeTab = 'home',
  onNavigate,
  showCenterRoute = true,
  isLowBatteryMapMode = false,
  styles,
}: HomeNavigationCardProps) {
  const insets = useSafeAreaInsets();
  const basePaddingBottom = Platform.OS === 'android' ? 10 : 20;
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const iconColor = (tab: BottomTab) =>
    activeTab === tab ? '#57c7a8' : isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#9AA0A6';
  const routeIsActive = activeTab === 'route';
  const textStyle = (tab: BottomTab) =>
    activeTab === tab
      ? styles.homeBottomTextActive
      : [styles.homeBottomText, isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null];
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
      style={[
        styles.homeBottomNav,
        isLowBatteryMapMode
          ? {
              backgroundColor: MAXIM_UI_SURFACE_DARK,
              borderTopWidth: 1,
              borderTopColor: MAXIM_UI_BORDER_SOFT_DARK,
            }
          : null,
        { paddingBottom: basePaddingBottom + (insets.bottom || 0) },
      ]}
      onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {layout && backgroundPath ? (
        <Svg
          pointerEvents="none"
          width={layout.width}
          height={layout.height}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }}
        >
          <Path
            d={backgroundPath.d}
            fill={isLowBatteryMapMode ? MAXIM_UI_SURFACE_DARK : '#FFFFFF'}
            fillRule={backgroundPath.fillRule}
          />
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
          <AppIcon name="home" size={18} color={iconColor('home')} active={activeTab === 'home'} />
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
          <AppIcon name="map" size={18} color={iconColor('trip')} active={activeTab === 'trip'} />
          <Text style={textStyle('trip')}>Trip</Text>
        </Pressable>
      </View>
      {showCenterRoute ? (
        <View style={styles.homeBottomCenterSlot}>
          <Pressable
            style={[
              styles.homeCenterRouteButton,
              routeIsActive && styles.homeCenterRouteButtonActive,
              isLowBatteryMapMode ? { shadowColor: '#57c7a8' } : null,
            ]}
            onPress={() => onNavigate?.('route')}
          >
            <AppIcon
              name="navigation"
              size={22}
              color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#FFFFFF'}
              active={routeIsActive}
            />
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
          <AppIcon name="alert-octagon" size={18} color={iconColor('violation')} active={activeTab === 'violation'} />
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
          <AppIcon name="user" size={18} color={iconColor('profile')} active={activeTab === 'profile'} />
          <Text style={textStyle('profile')}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}
