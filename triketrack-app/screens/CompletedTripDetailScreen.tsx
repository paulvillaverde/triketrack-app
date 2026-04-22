import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripRouteMap } from '../components/maps/TripRouteMap';
import { AppIcon, Avatar } from '../components/ui';
import { resolveTripHistoryRoutePath, type TripHistoryItem } from '../lib/tripTransactions';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from './homeScreenShared';

const OBRERO_GEOFENCE = [
  { latitude: 7.0832297, longitude: 125.624803 },
  { latitude: 7.076611, longitude: 125.617071 },
  { latitude: 7.078821, longitude: 125.6140047 },
  { latitude: 7.0817, longitude: 125.612905 },
  { latitude: 7.0835656, longitude: 125.612594 },
  { latitude: 7.0849408, longitude: 125.611754 },
  { latitude: 7.0868171, longitude: 125.613004 },
  { latitude: 7.09187, longitude: 125.6177977 },
];

type CompletedTripDetailScreenProps = {
  selectedTrip: TripHistoryItem;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  onBack: () => void;
  isLowBatteryMapMode?: boolean;
};

const getDaysAgo = (tripDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${tripDate}T00:00:00`);
  const diffMs = today.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const formatNumericDate = (tripDate: string) => {
  const date = new Date(`${tripDate}T00:00:00`);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const formatTripDateForCard = (tripDate: string) => {
  const daysAgo = getDaysAgo(tripDate);
  const numeric = formatNumericDate(tripDate);
  if (daysAgo === 0) return `${numeric} (Today)`;
  if (daysAgo === 1) return `${numeric} (Yesterday)`;
  return numeric;
};

const formatTripDateTime = (value: string | null) => {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTripNumber = (id: string) => id.replace(/^TRIP-/, '');

const getPickupLabel = (trip: TripHistoryItem) =>
  trip.startDisplayName?.trim() || 'Unknown pickup point';

const getDestinationLabel = (trip: TripHistoryItem) =>
  trip.endDisplayName?.trim() || 'Unknown destination';

const getRouteSourceLabel = (trip: TripHistoryItem) => {
  switch (trip.routeMatchSummary?.provider) {
    case 'osrm-match':
      return 'OSRM match';
    case 'osrm-route':
      return 'OSRM route';
    case 'ors-directions':
      return 'ORS route';
    case 'local-directional':
      return 'Local route';
    default:
      return trip.rawTelemetry.length > 0 ? 'Raw GPS' : 'No match';
  }
};

const getRouteRegion = (routePath: Array<{ latitude: number; longitude: number }>) => {
  if (routePath.length === 0) {
    return {
      latitude: 7.0832297,
      longitude: 125.624803,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  if (routePath.length === 1) {
    return {
      latitude: routePath[0].latitude,
      longitude: routePath[0].longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  const lats = routePath.map((point) => point.latitude);
  const lngs = routePath.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.008),
  };
};

export function CompletedTripDetailScreen({
  selectedTrip,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  onBack,
  isLowBatteryMapMode = false,
}: CompletedTripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomSystemInset = Math.max(insets.bottom || 0, Platform.OS === 'android' ? 48 : 0);
  const { height: windowHeight } = Dimensions.get('window');
  const detailSheetHeight = useMemo(() => Math.min(Math.max(windowHeight * 0.56, 430), 620), [windowHeight]);
  const detailSheetVisiblePeek = Math.min(318, Math.max(detailSheetHeight - 72, 240));
  const detailSheetCollapsedOffset = useMemo(
    () => Math.max(detailSheetHeight - detailSheetVisiblePeek, 0),
    [detailSheetHeight, detailSheetVisiblePeek],
  );
  const detailSheetTranslateY = useRef(new Animated.Value(detailSheetCollapsedOffset)).current;
  const detailSheetTranslateYValueRef = useRef(detailSheetCollapsedOffset);
  const detailSheetGestureStartRef = useRef(detailSheetCollapsedOffset);

  const selectedTripRoutePath = useMemo(
    () => resolveTripHistoryRoutePath(selectedTrip),
    [selectedTrip],
  );
  useEffect(() => {
    const listener = detailSheetTranslateY.addListener(({ value }) => {
      detailSheetTranslateYValueRef.current = value;
    });
    return () => {
      detailSheetTranslateY.removeListener(listener);
    };
  }, [detailSheetTranslateY]);

  useEffect(() => {
    detailSheetTranslateY.setValue(detailSheetCollapsedOffset);
  }, [detailSheetCollapsedOffset, detailSheetTranslateY, selectedTrip]);

  const animateDetailSheetTo = (target: number) => {
    Animated.spring(detailSheetTranslateY, {
      toValue: target,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
  };

  const detailSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          detailSheetGestureStartRef.current = detailSheetTranslateYValueRef.current;
          detailSheetTranslateY.stopAnimation((value) => {
            detailSheetGestureStartRef.current = value;
            detailSheetTranslateYValueRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.min(
            Math.max(detailSheetGestureStartRef.current + gestureState.dy, 0),
            detailSheetCollapsedOffset,
          );
          detailSheetTranslateY.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projectedValue = detailSheetTranslateYValueRef.current + gestureState.vy * 30;
          animateDetailSheetTo(projectedValue > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0);
        },
        onPanResponderTerminate: () => {
          animateDetailSheetTo(
            detailSheetTranslateYValueRef.current > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0,
          );
        },
      }),
    [detailSheetCollapsedOffset, detailSheetTranslateY],
  );

  const hasSavedRoute = selectedTripRoutePath.length > 0 || selectedTrip.rawStartPoint || selectedTrip.endLocationRaw;
  const vehiclePlateNumber = selectedTrip.vehiclePlateNumber ?? profilePlateNumber;
  const isDarkMode = isLowBatteryMapMode;

  return (
    <View style={[localStyles.detailScreen, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}>
      {hasSavedRoute ? (
        <View style={localStyles.detailMapContainer}>
          <TripRouteMap
            routePath={selectedTripRoutePath}
            rawStartPoint={selectedTrip.startLocationRaw ?? selectedTrip.rawStartPoint ?? null}
            matchedStartPoint={selectedTrip.startLocationMatched}
            dashedStartConnector={selectedTrip.dashedStartConnector}
            rawEndPoint={selectedTrip.endLocationRaw}
            endPoint={selectedTrip.endLocationMatched}
            dashedEndConnector={selectedTrip.dashedEndConnector}
            rawTelemetry={selectedTrip.rawTelemetry}
            geofence={OBRERO_GEOFENCE}
            lockSavedRoute={
              selectedTrip.syncStatus === 'SYNCED' &&
              selectedTripRoutePath.length > 1 &&
              selectedTrip.routeMatchSummary?.provider !== null &&
              typeof selectedTrip.routeMatchSummary?.provider === 'string' &&
              selectedTrip.routeMatchSummary.provider !== 'local-directional'
            }
            isLowBatteryMapMode={isLowBatteryMapMode}
            style={localStyles.tripMap}
            getRouteRegion={getRouteRegion}
          />
          <View
            style={[
              localStyles.mapReceiptOverlay,
              isDarkMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                    shadowOpacity: 0,
                    elevation: 0,
                  }
                : null,
              { top: Math.max(insets.top + 64, 82) },
            ]}
          >
            <View style={localStyles.mapEndpointRow}>
              <View style={[localStyles.mapEndpointIcon, localStyles.mapEndpointIconPickup]}>
                <AppIcon name="navigation" size={11} color="#147D64" />
              </View>
              <View style={localStyles.mapEndpointCopy}>
                <Text
                  style={[
                    localStyles.mapEndpointLabel,
                    isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Pickup point
                </Text>
                <Text
                  style={[
                    localStyles.mapEndpointValue,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {getPickupLabel(selectedTrip)}
                </Text>
              </View>
            </View>
            <View
              style={[
                localStyles.mapEndpointDivider,
                isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
              ]}
            />
            <View style={localStyles.mapEndpointRow}>
              <View style={[localStyles.mapEndpointIcon, localStyles.mapEndpointIconDestination]}>
                <AppIcon name="map-pin" size={11} color="#B42318" />
              </View>
              <View style={localStyles.mapEndpointCopy}>
                <Text
                  style={[
                    localStyles.mapEndpointLabel,
                    isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Destination
                </Text>
                <Text
                  style={[
                    localStyles.mapEndpointValue,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {getDestinationLabel(selectedTrip)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View
          style={[
            localStyles.detailMapContainer,
            localStyles.tripMapEmptyFull,
            isDarkMode ? { backgroundColor: MAXIM_UI_SURFACE_ALT_DARK } : null,
          ]}
        >
          <AppIcon name="map-pin" size={18} color="#94A3B8" />
          <Text
            style={[
              localStyles.tripMapEmptyText,
              isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            No route saved for this trip
          </Text>
        </View>
      )}

      <Pressable
        style={[
          localStyles.detailBackFloating,
          isDarkMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
                shadowOpacity: 0,
                elevation: 0,
              }
            : null,
          { top: Math.max(insets.top + 8, 18) },
        ]}
        onPress={onBack}
      >
        <AppIcon name="chevron-left" size={20} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
      </Pressable>

      <Animated.View
        style={[
          localStyles.detailBottomSafeArea,
          isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
          { height: Math.max(bottomSystemInset + 18, 42) },
          { transform: [{ translateY: detailSheetTranslateY }] },
        ]}
      />

      <Animated.View
        style={[
          localStyles.detailBottomSheet,
          isDarkMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
                shadowOpacity: 0,
                elevation: 0,
              }
            : null,
          {
            height: detailSheetHeight,
            paddingBottom: Math.max(bottomSystemInset, 14) + 8,
            transform: [{ translateY: detailSheetTranslateY }],
          },
        ]}
      >
        <View style={localStyles.sheetDragZone} {...detailSheetPanResponder.panHandlers}>
          <View
            style={[
              localStyles.sheetHandle,
              isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
            ]}
          />
        </View>

        <ScrollView
          contentContainerStyle={localStyles.detailSheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.rideSummaryCard}>
            <View style={localStyles.rideSummaryTripRow}>
              <View style={localStyles.rideTripCopy}>
                <Text style={localStyles.detailEyebrow}>Completed Trip</Text>
                <Text
                  style={[
                    localStyles.detailSheetSub,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  Trip #{getTripNumber(selectedTrip.id)}
                </Text>
              </View>
              <View
                style={[
                  localStyles.tripIdPill,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <Text
                  style={[
                    localStyles.tripIdPillText,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {selectedTrip.id}
                </Text>
              </View>
            </View>

            <View
              style={[
                localStyles.rideDriverTopRow,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                    }
                  : null,
              ]}
            >
              <View style={localStyles.rideDriverLeft}>
                <Avatar
                  name={profileName}
                  imageUri={profileImageUri}
                  style={localStyles.driverAvatarImage}
                />
                <View style={localStyles.driverTextWrap}>
                  <Text
                    style={[
                      localStyles.driverName,
                      isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileName}
                  </Text>
                  <Text
                    style={[
                      localStyles.driverSub,
                      isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileDriverCode}
                  </Text>
                </View>
              </View>
              <View style={localStyles.rideVehicleInfo}>
                <Text
                  style={[
                    localStyles.rideVehicleText,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {vehiclePlateNumber}
                </Text>
                <Text
                  style={[
                    localStyles.rideVehicleSub,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  Plate number
                </Text>
              </View>
            </View>

            <View style={localStyles.rideStatusRow}>
              <View style={localStyles.statusPill}>
                <Text style={localStyles.statusPillText}>Completed</Text>
              </View>
              <Text
                style={[
                  localStyles.rideStatusMeta,
                  isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
                numberOfLines={1}
              >
                {formatTripDateForCard(selectedTrip.tripDate)}
              </Text>
            </View>

            <View style={localStyles.rideMetricGrid}>
              <SummaryMetric label="Fare" value={selectedTrip.fare} isDarkMode={isDarkMode} />
              <SummaryMetric label="Payment" value={selectedTrip.fare} isDarkMode={isDarkMode} />
              <SummaryMetric label="Duration" value={selectedTrip.duration} isDarkMode={isDarkMode} />
              <SummaryMetric label="Distance" value={selectedTrip.distance} isDarkMode={isDarkMode} />
              <SummaryMetric label="Started" value={formatTripDateTime(selectedTrip.startedAt)} isDarkMode={isDarkMode} />
              <SummaryMetric label="Ended" value={formatTripDateTime(selectedTrip.endedAt)} isDarkMode={isDarkMode} />
              <SummaryMetric label="Violations" value={selectedTrip.violations} isDarkMode={isDarkMode} />
              <SummaryMetric label="Compliance" value={`${selectedTrip.compliance}%`} isDarkMode={isDarkMode} />
              <SummaryMetric label="Route" value={getRouteSourceLabel(selectedTrip)} isDarkMode={isDarkMode} />
            </View>
          </View>

          <View style={localStyles.feedbackCard}>
            <Text
              style={[
                localStyles.feedbackLabel,
                isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
            >
              Feedback
            </Text>
            <View
              style={[
                localStyles.feedbackBox,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <Text
                style={[
                  localStyles.feedbackEmptyText,
                  isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                ]}
              >
                No feedback submitted
              </Text>
            </View>
          </View>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  isDarkMode = false,
}: {
  label: string;
  value: string;
  isDarkMode?: boolean;
}) {
  return (
    <View style={localStyles.rideMetricCell}>
      <Text
        style={[
          localStyles.rideMetricLabel,
          isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          localStyles.rideMetricValue,
          isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  detailScreen: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  detailMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  tripMap: {
    flex: 1,
  },
  tripMapEmptyFull: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  tripMapEmptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  mapReceiptOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  mapEndpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapEndpointIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapEndpointIconPickup: {
    backgroundColor: '#E8FBF6',
  },
  mapEndpointIconDestination: {
    backgroundColor: '#FEE4E2',
  },
  mapEndpointCopy: {
    flex: 1,
    minWidth: 0,
  },
  mapEndpointLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  mapEndpointValue: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  mapEndpointDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: '#EEF2F6',
  },
  detailBackFloating: {
    position: 'absolute',
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    zIndex: 10,
  },
  detailBottomSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F4F6FA',
  },
  detailBottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  sheetDragZone: {
    paddingTop: 2,
    paddingBottom: 2,
    marginBottom: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D0D7E2',
    marginBottom: 12,
  },
  detailSheetScrollContent: {
    paddingBottom: 18,
  },
  rideSummaryCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  rideSummaryTripRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  rideTripCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailEyebrow: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#57A88D',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 5,
  },
  detailSheetSub: {
    fontSize: 20,
    lineHeight: 24,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripIdPill: {
    maxWidth: 104,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  tripIdPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  rideDriverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  rideDriverLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  driverTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  rideVehicleInfo: {
    flexShrink: 0,
    width: 104,
    alignItems: 'flex-end',
  },
  rideVehicleText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideVehicleSub: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 11,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  rideStatusMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 13,
  },
  rideMetricCell: {
    width: '33.333%',
    minWidth: 0,
    paddingRight: 8,
  },
  rideMetricLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  rideMetricValue: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  feedbackCard: {
    marginTop: 18,
  },
  feedbackLabel: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  feedbackBox: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  feedbackEmptyText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
});
