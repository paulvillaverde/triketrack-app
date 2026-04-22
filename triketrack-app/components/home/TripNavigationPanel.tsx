import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { AppIcon } from '../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../screens/homeScreenShared';

type TripNavigationPanelProps = {
  localStyles: Record<string, any>;
  insetsBottom: number;
  minutesText: string;
  kmText: string;
  speedKmh: number;
  currentAreaLabel: string;
  isInsideGeofence: boolean;
  isLowGpsAccuracy: boolean;
  onEndTripPress: () => void | Promise<void>;
  onLayout?: (event: LayoutChangeEvent) => void;
  isLowBatteryMapMode?: boolean;
};

export function TripNavigationPanel({
  localStyles,
  insetsBottom,
  minutesText,
  kmText,
  speedKmh,
  currentAreaLabel,
  isInsideGeofence,
  isLowGpsAccuracy,
  onEndTripPress,
  onLayout,
  isLowBatteryMapMode = false,
}: TripNavigationPanelProps) {
  return (
    <View
      style={[
        localStyles.tripNavigationPanel,
        isLowBatteryMapMode
          ? {
              backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
              borderTopWidth: 1,
              borderTopColor: MAXIM_UI_BORDER_DARK,
              shadowOpacity: 0,
              elevation: 0,
            }
          : null,
        { bottom: 26 + (insetsBottom || 0) },
      ]}
      onLayout={onLayout}
    >
      <View
        style={[
          localStyles.tripNavigationHandle,
          isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
        ]}
      />

      <View style={localStyles.tripNavigationSummaryRow}>
        <Pressable
          style={[
            localStyles.tripNavigationCloseButton,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                }
              : null,
          ]}
          onPress={onEndTripPress}
        >
          <AppIcon name="x" size={24} color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
        </Pressable>
        <View style={localStyles.tripNavigationSummaryMain}>
          <Text
            style={[
              localStyles.tripNavigationTimer,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            {minutesText}
          </Text>
          <Text
            style={[
              localStyles.tripNavigationMeta,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            {kmText} km · {speedKmh.toFixed(1)} km/h
          </Text>
        </View>
        <View
          style={[
            localStyles.tripNavigationTrackingPill,
            isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
          ]}
        >
          <Text style={localStyles.tripNavigationTrackingText}>Tracking</Text>
        </View>
      </View>

      <View
        style={[
          localStyles.tripNavigationDivider,
          isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
        ]}
      />

      <View style={localStyles.tripNavigationRouteRow}>
        <View
          style={[
            localStyles.tripNavigationRouteIcon,
            isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_SURFACE_ALT_DARK } : null,
          ]}
        >
          <AppIcon name="navigation" size={18} color="#13A37A" active />
        </View>
        <View style={localStyles.tripNavigationRouteCopy}>
          <Text
            style={[
              localStyles.tripNavigationRouteTitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
            numberOfLines={1}
          >
            {currentAreaLabel || 'Live route tracking'}
          </Text>
          <Text
            style={[
              localStyles.tripNavigationRouteSubtitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            {isLowGpsAccuracy ? 'GPS recovering' : 'Live route updating'}
          </Text>
        </View>
      </View>

      <View style={localStyles.tripNavigationFooterRow}>
        <Text
          style={[
            localStyles.tripNavigationFooterText,
            isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
          ]}
        >
          {kmText} km travelled
        </Text>
        <View style={localStyles.tripNavigationFooterStatus}>
          <AppIcon
            name={isInsideGeofence ? 'check-circle' : 'alert-triangle'}
            size={12}
            color={isInsideGeofence ? '#13A37A' : '#DC2626'}
            active
          />
          <Text
            style={[
              localStyles.tripNavigationFooterText,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            {isInsideGeofence ? `${speedKmh.toFixed(1)} km/h` : 'Outside geofence'}
          </Text>
        </View>
      </View>
    </View>
  );
}
