import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { TripRouteMap } from '../components/maps/TripRouteMap';
import { Avatar } from '../components/ui';

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
  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);
  const [listTab, setListTab] = useState<'ALL' | 'THIS_WEEK' | 'LAST_WEEK' | 'OVER_30'>('ALL');
  const [query, setQuery] = useState('');

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
                <Feather name="map-pin" size={18} color="#94A3B8" />
                <Text style={localStyles.tripMapEmptyText}>No route saved for this trip</Text>
              </View>
            )}

            <Pressable style={localStyles.detailBackFloating} onPress={() => setSelectedTrip(null)}>
              <Feather name="chevron-left" size={20} color="#111827" />
            </Pressable>

            <View style={localStyles.detailBottomSheet}>
              <View style={localStyles.sheetHandle} />
              <Text style={localStyles.detailSheetSub}>Trip #{getTripNumber(selectedTrip.id)}</Text>

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
                <Text style={localStyles.vehicleText}>{selectedTrip.id}</Text>
              </View>

              <View style={localStyles.detailMetricsGrid}>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Fare</Text>
                  <Text style={localStyles.metricValue}>{selectedTrip.fare}</Text>
                </View>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Distance</Text>
                  <Text style={localStyles.metricValue}>{selectedTrip.distance}</Text>
                </View>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Duration</Text>
                  <Text style={localStyles.metricValue}>{selectedTrip.duration}</Text>
                </View>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Date</Text>
                  <Text style={localStyles.metricValue}>{formatTripDateForCard(selectedTrip.tripDate)}</Text>
                </View>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Violations</Text>
                  <Text style={localStyles.metricValue}>{selectedTrip.violations}</Text>
                </View>
                <View style={localStyles.detailMetricBlock}>
                  <Text style={localStyles.metricLabel}>Compliance</Text>
                  <Text style={localStyles.metricValue}>{selectedTrip.compliance}%</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={localStyles.listHeaderRow}>
              <Pressable style={localStyles.iconGhost} onPress={() => onNavigate?.('home')}>
                <Feather name="chevron-left" size={18} color="#111827" />
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
              <Feather name="search" size={16} color="#9CA3AF" />
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

      <HomeNavigationCard
        activeTab={activeTab}
        onNavigate={onNavigate}
        showCenterRoute={false}
        styles={styles}
      />
    </View>
  );

  function TripCardContent({ trip }: { trip: TripItem }) {
    return (
      <View style={localStyles.tripRowInner}>
        <View style={localStyles.tripRowBadge}>
          <Feather name="navigation" size={14} color="#FFFFFF" />
        </View>
        <View style={localStyles.tripRowMain}>
          <Text style={localStyles.tripRowTitle}>Trip #{getTripNumber(trip.id)}</Text>
          <View style={localStyles.tripRowMeta}>
            <Feather name="calendar" size={11} color="#6B7280" />
            <Text style={localStyles.tripRowMetaText}>{formatTripDateForCard(trip.tripDate)}</Text>
            <Feather name="clock" size={11} color="#6B7280" />
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
    bottom: 74,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#E4EBF2',
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D7DEE7',
    marginBottom: 10,
  },
  detailSheetSub: {
    marginTop: 0,
    marginBottom: 10,
    fontSize: 15,
    lineHeight: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
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
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    marginBottom: 10,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  driverTextWrap: {
    flex: 1,
  },
  driverName: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  vehicleText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  detailMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailMetricBlock: {
    width: '48%',
    marginBottom: 9,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  metricValue: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
});


