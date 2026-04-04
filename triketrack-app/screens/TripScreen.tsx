import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { TripRouteMap } from '../components/maps/TripRouteMap';
import { AppIcon, Avatar, type AppIconName } from '../components/ui';

type TripScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  tripHistory: TripItem[];
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  activeTab?: BottomTab;
  styles: Record<string, any>;
};

type TripItem = {
  id: string;
  tripDate: string;
  duration: string;
  distance: string;
  fare: string;
  violations: string;
  status: 'ONGOING' | 'COMPLETED' | 'FLAGGED';
  compliance: number;
  routePath: Array<{ latitude: number; longitude: number }>;
};

const OBRERO_GEOFENCE = [
  { latitude: 7.0849408, longitude: 125.6121403 },
  { latitude: 7.0861485, longitude: 125.6130254 },
  { latitude: 7.09253, longitude: 125.61713 },
  { latitude: 7.0832297, longitude: 125.6242034 },
  { latitude: 7.0771506, longitude: 125.6170807 },
  { latitude: 7.0776251, longitude: 125.6141467 },
  { latitude: 7.0835656, longitude: 125.6126754 },
];

export function TripScreen({
  onLogout: _onLogout,
  onNavigate,
  tripHistory,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  activeTab = 'trip',
  styles,
}: TripScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = Dimensions.get('window');
  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);
  const [listTab, setListTab] = useState<'ALL' | 'THIS_WEEK' | 'LAST_WEEK' | 'OVER_30'>('ALL');
  const [query, setQuery] = useState('');
  const detailSheetHeight = useMemo(() => Math.min(Math.max(windowHeight * 0.48, 600), 450), [windowHeight]);
  const detailSheetVisiblePeek = 280;
  const detailSheetCollapsedOffset = useMemo(
    () => Math.max(detailSheetHeight - detailSheetVisiblePeek, 0),
    [detailSheetHeight],
  );
  const detailSheetTranslateY = useRef(new Animated.Value(detailSheetCollapsedOffset)).current;
  const detailSheetTranslateYValueRef = useRef(detailSheetCollapsedOffset);
  const detailSheetGestureStartRef = useRef(detailSheetCollapsedOffset);

  useEffect(() => {
    const listener = detailSheetTranslateY.addListener(({ value }) => {
      detailSheetTranslateYValueRef.current = value;
    });
    return () => {
      detailSheetTranslateY.removeListener(listener);
    };
  }, [detailSheetTranslateY]);

  useEffect(() => {
    if (!selectedTrip) {
      return;
    }
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
          const target =
            projectedValue > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0;
          animateDetailSheetTo(target);
        },
        onPanResponderTerminate: () => {
          animateDetailSheetTo(detailSheetTranslateYValueRef.current > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0);
        },
      }),
    [detailSheetCollapsedOffset, detailSheetTranslateY],
  );

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

  const thisWeekTrips = useMemo(
    () => tripHistory.filter((item) => getDaysAgo(item.tripDate) >= 0 && getDaysAgo(item.tripDate) <= 6),
    [tripHistory],
  );
  const lastWeekTrips = useMemo(
    () => tripHistory.filter((item) => getDaysAgo(item.tripDate) >= 7 && getDaysAgo(item.tripDate) < 30),
    [tripHistory],
  );
  const over30DaysTrips = useMemo(
    () => tripHistory.filter((item) => getDaysAgo(item.tripDate) >= 30),
    [tripHistory],
  );
  const visibleTrips = useMemo(() => {
    if (listTab === 'THIS_WEEK') return thisWeekTrips;
    if (listTab === 'LAST_WEEK') return lastWeekTrips;
    if (listTab === 'OVER_30') return over30DaysTrips;
    return tripHistory;
  }, [listTab, thisWeekTrips, lastWeekTrips, over30DaysTrips, tripHistory]);

  const searchedTrips = useMemo(() => {
    if (!query.trim()) {
      return visibleTrips;
    }
    const q = query.trim().toLowerCase();
    return visibleTrips.filter((trip) => {
      return (
        trip.id.toLowerCase().includes(q) ||
        trip.tripDate.toLowerCase().includes(q) ||
        trip.duration.toLowerCase().includes(q) ||
        trip.distance.toLowerCase().includes(q) ||
        trip.fare.toLowerCase().includes(q)
      );
    });
  }, [visibleTrips, query]);

  const getTripNumber = (id: string) => id.replace(/^TRIP-/, '');

  const getRouteRegion = (routePath: Array<{ latitude: number; longitude: number }>) => {
    if (routePath.length === 0) {
      return {
        latitude: 7.0849408,
        longitude: 125.6121403,
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

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        {selectedTrip ? (
          <View style={localStyles.detailScreen}>
            {selectedTrip.routePath.length > 0 ? (
              <View style={localStyles.detailMapContainer}>
                <TripRouteMap
                  routePath={selectedTrip.routePath}
                  geofence={OBRERO_GEOFENCE}
                  style={localStyles.tripMap}
                  getRouteRegion={getRouteRegion}
                />
              </View>
            ) : (
              <View style={[localStyles.detailMapContainer, localStyles.tripMapEmptyFull]}>
                <AppIcon name="map-pin" size={18} color="#94A3B8" />
                <Text style={localStyles.tripMapEmptyText}>No route saved for this trip</Text>
              </View>
            )}

            <Pressable
              style={[
                localStyles.detailBackFloating,
                { top: Math.max(insets.top + 8, 18) },
              ]}
              onPress={() => setSelectedTrip(null)}
            >
              <AppIcon name="chevron-left" size={20} color="#111827" />
            </Pressable>

            <Animated.View
              style={[
                localStyles.detailBottomSafeArea,
                { height: Math.max(insets.bottom + 18, 42) },
                {
                  transform: [{ translateY: detailSheetTranslateY }],
                },
              ]}
            />

            <Animated.View
              style={[
                localStyles.detailBottomSheet,
                {
                  height: detailSheetHeight,
                  paddingBottom: Math.max(insets.bottom, 14) + 8,
                  transform: [{ translateY: detailSheetTranslateY }],
                },
              ]}
            >
              <View style={localStyles.sheetDragZone} {...detailSheetPanResponder.panHandlers}>
                <View style={localStyles.sheetHandle} />
              </View>

              <View style={localStyles.detailSheetScrollContent}>
                <View style={localStyles.detailHeaderBlock}>
                  <Text style={localStyles.detailEyebrow}>Completed Trip</Text>
                  <View style={localStyles.detailTitleRow}>
                    <Text style={localStyles.detailSheetSub}>Trip #{getTripNumber(selectedTrip.id)}</Text>
                    <View style={localStyles.tripIdPill}>
                      <Text style={localStyles.tripIdPillText}>{selectedTrip.id}</Text>
                    </View>
                  </View>
                </View>

                <View style={localStyles.detailDriverRow}>
                  <Avatar
                    name={profileName}
                    imageUri={profileImageUri}
                    style={localStyles.driverAvatarImage}
                  />
                  <View style={localStyles.driverTextWrap}>
                    <Text style={localStyles.driverName}>{profileName}</Text>
                    <Text style={localStyles.driverSub}>
                      {profileDriverCode} {'\u2022'} Plate No. {profilePlateNumber}
                    </Text>
                  </View>
                  <View style={localStyles.statusPill}>
                    <Text style={localStyles.statusPillText}>Completed</Text>
                  </View>
                </View>

                <View style={localStyles.primaryStatsRow}>
                  <SummaryStat icon="dollar-sign" label="Fare" value={selectedTrip.fare} />
                  <SummaryStat icon="map" label="Distance" value={selectedTrip.distance} />
                  <SummaryStat icon="clock" label="Duration" value={selectedTrip.duration} />
                </View>

                <View style={localStyles.detailSection}>
                  <Text style={localStyles.detailSectionTitle}>Trip details</Text>

                  <View style={localStyles.detailInfoRow}>
                    <DetailInfoItem label="Date" value={formatTripDateForCard(selectedTrip.tripDate)} />
                    <DetailInfoItem label="Trip ID" value={selectedTrip.id} align="right" />
                  </View>
                  <View style={localStyles.detailInfoDivider} />
                  <View style={localStyles.detailInfoRow}>
                    <DetailInfoItem label="Violations" value={selectedTrip.violations} />
                    <DetailInfoItem label="Compliance" value={`${selectedTrip.compliance}%`} align="right" />
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={localStyles.listHeaderRow}>
              <Pressable style={localStyles.iconGhost} onPress={() => onNavigate?.('home')}>
                <AppIcon name="chevron-left" size={18} color="#111827" />
              </Pressable>
              <Text style={localStyles.headerTitle}>Trip History</Text>
              <View style={localStyles.iconGhost} />
            </View>

            <View style={localStyles.searchCard}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor="#98A3B3"
                style={localStyles.searchInput}
              />
              <AppIcon name="search" size={16} color="#9CA3AF" />
            </View>
            <Text style={localStyles.listSub}>Showing all your trip records</Text>

            <View style={localStyles.tabsRow}>
              <Pressable
                style={[localStyles.tabPill, listTab === 'ALL' && localStyles.tabPillActive]}
                onPress={() => setListTab('ALL')}
              >
                <Text style={[localStyles.tabText, listTab === 'ALL' && localStyles.tabTextActive]}>All</Text>
              </Pressable>
              <Pressable
                style={[localStyles.tabPill, listTab === 'THIS_WEEK' && localStyles.tabPillActive]}
                onPress={() => setListTab('THIS_WEEK')}
              >
                <Text style={[localStyles.tabText, listTab === 'THIS_WEEK' && localStyles.tabTextActive]}>
                  This Week
                </Text>
              </Pressable>
              <Pressable
                style={[localStyles.tabPill, listTab === 'LAST_WEEK' && localStyles.tabPillActive]}
                onPress={() => setListTab('LAST_WEEK')}
              >
                <Text style={[localStyles.tabText, listTab === 'LAST_WEEK' && localStyles.tabTextActive]}>
                  Last Week
                </Text>
              </Pressable>
              <Pressable
                style={[localStyles.tabPill, listTab === 'OVER_30' && localStyles.tabPillActive]}
                onPress={() => setListTab('OVER_30')}
              >
                <Text style={[localStyles.tabText, listTab === 'OVER_30' && localStyles.tabTextActive]}>
                  30+ Days
                </Text>
              </Pressable>
            </View>

            {searchedTrips.length === 0 ? (
              <View style={localStyles.emptySection}>
                <Text style={localStyles.emptyText}>No trips in this section</Text>
              </View>
            ) : (
              searchedTrips.map((trip) => (
                <Pressable key={trip.id} style={localStyles.tripRow} onPress={() => setSelectedTrip(trip)}>
                  <TripCardContent trip={trip} />
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {!selectedTrip ? (
        <HomeNavigationCard
          activeTab={activeTab}
          onNavigate={onNavigate}
          showCenterRoute={false}
          styles={styles}
        />
      ) : null}
    </View>
  );

  function TripCardContent({ trip }: { trip: TripItem }) {
    return (
      <View style={localStyles.tripRowInner}>
        <View style={localStyles.tripRowBadge}>
          <AppIcon name="navigation" size={14} color="#FFFFFF" />
        </View>
        <View style={localStyles.tripRowMain}>
          <Text style={localStyles.tripRowTitle}>Trip #{getTripNumber(trip.id)}</Text>
          <View style={localStyles.tripRowMeta}>
            <AppIcon name="calendar" size={11} color="#6B7280" />
            <Text style={localStyles.tripRowMetaText}>{formatTripDateForCard(trip.tripDate)}</Text>
            <AppIcon name="clock" size={11} color="#6B7280" />
            <Text style={localStyles.tripRowMetaText}>{trip.duration}</Text>
          </View>
          <View style={localStyles.tripRowMeta}>
            <Text style={localStyles.tripRowDistance}>{trip.distance}</Text>
            <Text style={localStyles.tripRowDot}>•</Text>
            <Text style={localStyles.tripRowMetaText}>Completed</Text>
          </View>
        </View>
        <Text style={localStyles.tripRowFare}>{trip.fare}</Text>
      </View>
    );
  }

  function SummaryStat({
    icon,
    label,
    value,
  }: {
    icon: AppIconName;
    label: string;
    value: string;
  }) {
    return (
      <View style={localStyles.primaryStatCard}>
        <View style={localStyles.primaryStatIconWrap}>
          <AppIcon name={icon} size={14} color="#57c7a8" />
        </View>
        <Text style={localStyles.primaryStatLabel}>{label}</Text>
        <Text style={localStyles.primaryStatValue}>{value}</Text>
      </View>
    );
  }

  function DetailInfoItem({
    label,
    value,
    align = 'left',
  }: {
    label: string;
    value: string;
    align?: 'left' | 'right';
  }) {
    return (
      <View style={[localStyles.detailInfoItem, align === 'right' && localStyles.detailInfoItemRight]}>
        <Text style={localStyles.detailInfoLabel}>{label}</Text>
        <Text style={[localStyles.detailInfoValue, align === 'right' && localStyles.detailInfoValueRight]}>
          {value}
        </Text>
      </View>
    );
  }
}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 140,
    backgroundColor: '#F2F4F7',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconGhost: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8E2F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    paddingVertical: 0,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  listSub: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  tabPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E0E7EF',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  tabPillActive: {
    backgroundColor: '#3F7DE8',
    borderColor: '#3F7DE8',
  },
  tabText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  emptySection: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tripRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripRowBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#57c7a8',
  },
  tripRowMain: {
    flex: 1,
    marginRight: 8,
  },
  tripRowTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowMeta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  tripRowMetaText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowDistance: {
    fontSize: 12,
    lineHeight: 15,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowDot: {
    fontSize: 11,
    lineHeight: 15,
    color: '#9CA3AF',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowFare: {
    fontSize: 22,
    lineHeight: 26,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  simpleTripTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  simpleRouteLeft: {
    flex: 1,
    paddingRight: 8,
  },
  simpleRouteTitle: {
    fontSize: 16,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    flex: 1,
  },
  simpleTripMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
    paddingTop: 11,
    flexWrap: 'wrap',
    rowGap: 10,
  },
  simpleMetricItem: {
    width: '48%',
    alignItems: 'flex-start',
    paddingRight: 6,
  },
  tripCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDotWrap: {
    width: 26,
    alignItems: 'center',
    paddingTop: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeMain: {
    flex: 1,
    paddingRight: 8,
  },
  routeText: {
    fontSize: 21,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  routeSub: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  routeRightMeta: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  metaValue: {
    marginTop: 3,
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  paymentValue: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 18,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
    backgroundColor: '#E8FBF6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  routeDividerColumn: {
    width: 26,
    alignItems: 'center',
  },
  routeDivider: {
    width: 2,
    height: 17,
    borderRadius: 1,
    backgroundColor: '#E2E8F0',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5EAF0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBackButtonPlaceholder: {
    width: 32,
    height: 32,
  },
  detailTitle: {
    fontSize: 19,
    lineHeight: 23,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  detailsSectionLabel: {
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 17,
    color: '#9CA3AF',
    fontFamily: 'CircularStdMedium500',
  },
  detailInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EBF2',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  detailSummaryRow: {
    marginBottom: 12,
  },
  tripMapCard: {
    height: 190,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  tripMap: {
    flex: 1,
  },
  detailScreen: {
    flex: 1,
    backgroundColor: '#EDEFF2',
  },
  detailMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  detailBottomSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  detailBackFloating: {
    position: 'absolute',
    top: 18,
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 10,
  },
  detailBottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
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
    backgroundColor: '#D7DEE7',
    marginBottom: 12,
  },
  detailSheetScrollContent: {
    paddingBottom: 4,
  },
  detailHeaderBlock: {
    marginBottom: 12,
  },
  detailEyebrow: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 5,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailSheetSub: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripIdPill: {
    borderRadius: 999,
    backgroundColor: '#F3F6FA',
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
  tripMapEmpty: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  tripMapEmptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripMapEmptyFull: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  detailDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    marginBottom: 14,
  },
  driverAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  driverAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  driverTextWrap: {
    flex: 1,
  },
  driverName: {
    fontSize: 17,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#E8FBF6',
    borderWidth: 1,
    borderColor: '#BDEDDC',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#17906E',
    fontFamily: 'CircularStdMedium500',
  },
  primaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  primaryStatCard: {
    flex: 1,
    minHeight: 82,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E7EDF3',
  },
  primaryStatIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  primaryStatLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  primaryStatValue: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  detailSection: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EDF3',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  detailSectionTitle: {
    fontSize: 12,
    lineHeight: 15,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  detailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailInfoItem: {
    flex: 1,
  },
  detailInfoItemRight: {
    alignItems: 'flex-end',
  },
  detailInfoLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  detailInfoValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  detailInfoValueRight: {
    textAlign: 'right',
  },
  detailInfoDivider: {
    height: 1,
    backgroundColor: '#EEF2F6',
    marginVertical: 12,
  },
});


