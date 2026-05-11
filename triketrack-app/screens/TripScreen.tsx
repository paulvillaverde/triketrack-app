import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { AppIcon } from '../components/ui';
import { type TripHistoryItem } from '../lib/tripTransactions';
import { MAXIM_UI_SUBTLE_DARK } from './homeScreenShared';
import { CompletedTripDetailScreen } from './CompletedTripDetailScreen';

type TripHistoryListTab = 'ALL' | 'THIS_WEEK' | 'LAST_WEEK' | 'OVER_30' | 'UNSYNCED';

type TripScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  tripHistory: TripHistoryItem[];
  focusTripRequest?: {
    tripId: string;
    requestedAt: number;
  } | null;
  onDeleteTrip?: (tripId: string) => void | Promise<void>;
  onRoadMatchOfflineTrip?: (trip: TripHistoryItem) => void | Promise<void>;
  onSyncOfflineTrip?: (trip: TripHistoryItem) => void | Promise<void>;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  isLowBatteryMapMode: boolean;
  activeTab?: BottomTab;
  styles: Record<string, any>;
};

const formatHeadingLabel = (heading: number | null | undefined) => {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) {
    return '--';
  }

  const normalized = ((heading % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const direction = directions[Math.round(normalized / 45) % directions.length];
  return `${Math.round(normalized)}° ${direction}`;
};

const formatHeadingDirection = (heading: number | null | undefined) => {
  const label = formatHeadingLabel(heading);
  return label === '--' ? null : label.split(' ').at(-1) ?? null;
};

export function TripScreen({
  onLogout: _onLogout,
  onNavigate,
  tripHistory,
  focusTripRequest = null,
  onDeleteTrip,
  onRoadMatchOfflineTrip,
  onSyncOfflineTrip,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  isLowBatteryMapMode,
  activeTab = 'trip',
  styles,
}: TripScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedTrip, setSelectedTrip] = useState<TripHistoryItem | null>(null);
  const [listTab, setListTab] = useState<TripHistoryListTab>('ALL');
  const [query, setQuery] = useState('');
  const [isManagingTrips, setIsManagingTrips] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [isDeletingTrips, setIsDeletingTrips] = useState(false);
  const isLowBatteryTheme = isLowBatteryMapMode;
  const [dateLabelNow, setDateLabelNow] = useState(() => new Date());

  const getLocalDateKey = (value: Date) => {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getTripLocalDateKey = (trip: TripHistoryItem) => {
    const timestamp = trip.startedAt ?? trip.endedAt;
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (Number.isFinite(parsed.getTime())) {
        return getLocalDateKey(parsed);
      }
    }

    return trip.tripDate;
  };

  useEffect(() => {
    if (!selectedTrip) {
      return;
    }
    const refreshedSelectedTrip = tripHistory.find((item) => item.id === selectedTrip.id) ?? null;
    if (refreshedSelectedTrip) {
      setSelectedTrip(refreshedSelectedTrip);
      return;
    }

    setSelectedTrip(null);
  }, [selectedTrip, tripHistory]);

  useEffect(() => {
    if (!focusTripRequest?.tripId) {
      return;
    }

    const focusedTrip =
      tripHistory.find((item) => item.id === focusTripRequest.tripId) ??
      tripHistory.find((item) => {
        const normalizedTarget = focusTripRequest.tripId.replace(/^TRIP-/, '');
        return item.id.replace(/^TRIP-/, '') === normalizedTarget;
      }) ??
      null;

    if (!focusedTrip) {
      return;
    }

    setIsManagingTrips(false);
    setSelectedTripIds([]);
    setQuery('');
    setListTab('ALL');
    setSelectedTrip(focusedTrip);
  }, [focusTripRequest?.requestedAt, focusTripRequest?.tripId, tripHistory]);

  useEffect(() => {
    const existingTripIds = new Set(tripHistory.map((item) => item.id));
    setSelectedTripIds((current) => current.filter((tripId) => existingTripIds.has(tripId)));
  }, [tripHistory]);

  useEffect(() => {
    const timer = setInterval(() => setDateLabelNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const getDaysAgo = (tripDate: string) => {
    const today = new Date(dateLabelNow);
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${tripDate}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const getTripDaysAgo = (trip: TripHistoryItem) => getDaysAgo(getTripLocalDateKey(trip));

  const formatNumericDate = (tripDate: string) => {
    const date = new Date(`${tripDate}T00:00:00`);
    if (!Number.isFinite(date.getTime())) {
      return tripDate;
    }
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  const formatTripDateForCard = (trip: TripHistoryItem) => {
    const tripDate = getTripLocalDateKey(trip);
    const daysAgo = getDaysAgo(tripDate);
    const numeric = formatNumericDate(tripDate);
    if (daysAgo === 0) return `${numeric} (Today)`;
    if (daysAgo === 1) return `${numeric} (Yesterday)`;
    return numeric;
  };

  const getPickupLabel = (trip: TripHistoryItem) =>
    trip.startDisplayName?.trim() || 'Unknown pickup point';

  const getDestinationLabel = (trip: TripHistoryItem) =>
    trip.endDisplayName?.trim() || 'Unknown destination';

  const matchesTripQuery = useCallback(
    (trip: TripHistoryItem) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return true;
      }

      return (
        trip.id.toLowerCase().includes(normalizedQuery) ||
        trip.tripDate.toLowerCase().includes(normalizedQuery) ||
        trip.duration.toLowerCase().includes(normalizedQuery) ||
        trip.distance.toLowerCase().includes(normalizedQuery) ||
        trip.fare.toLowerCase().includes(normalizedQuery)
      );
    },
    [query],
  );

  const isVerifiedFinalizedTrip = useCallback((trip: TripHistoryItem) => {
    const hasStartPoint =
      Boolean(trip.startDisplayName?.trim()) ||
      trip.startLocationRaw !== null ||
      trip.startLocationMatched !== null ||
      trip.routePath.length > 0 ||
      trip.rawTelemetry.length > 0;
    const hasEndPoint =
      Boolean(trip.endDisplayName?.trim()) ||
      trip.endLocationRaw !== null ||
      trip.endLocationMatched !== null ||
      trip.routePath.length > 0 ||
      trip.rawTelemetry.length > 0;
    const hasRequiredMetrics =
      Number.isFinite(trip.durationSeconds) &&
      trip.durationSeconds >= 0 &&
      Number.isFinite(trip.totalDistanceMatchedMeters) &&
      Number.isFinite(trip.rawGpsPointCount) &&
      Number.isFinite(trip.matchedPointCount);

    return (
      trip.status === 'COMPLETED' &&
      trip.tripDate.trim().length > 0 &&
      hasStartPoint &&
      hasEndPoint &&
      hasRequiredMetrics
    );
  }, []);

  const isOfflineSavedUnsyncedTrip = useCallback((trip: TripHistoryItem) => {
    if (trip.syncStatus === 'SYNCED' || trip.offlineSyncStatus === 'synced') {
      return false;
    }

    const hasRawGps =
      trip.rawTelemetry.length > 0 ||
      (Number.isFinite(trip.rawGpsPointCount) && trip.rawGpsPointCount > 0);
    const isOfflineSyncCandidate =
      trip.offlineSyncStatus === 'completed_offline' ||
      trip.offlineSyncStatus === 'syncing' ||
      trip.offlineSyncStatus === 'failed';

    return (
      (isOfflineSyncCandidate || trip.syncStatus === 'SYNC_PENDING') &&
      trip.status === 'COMPLETED' &&
      hasRawGps
    );
  }, []);

  const eligibleFinalizedTrips = useMemo(
    () => tripHistory.filter((item) => item.syncStatus === 'SYNCED'),
    [tripHistory],
  );
  const syncedTrips = useMemo(
    () => eligibleFinalizedTrips.filter((item) => item.syncStatus === 'SYNCED'),
    [eligibleFinalizedTrips],
  );
  const thisWeekTrips = useMemo(
    () => syncedTrips.filter((item) => getTripDaysAgo(item) >= 0 && getTripDaysAgo(item) <= 6),
    [dateLabelNow, syncedTrips],
  );
  const lastWeekTrips = useMemo(
    () => syncedTrips.filter((item) => getTripDaysAgo(item) >= 7 && getTripDaysAgo(item) < 30),
    [dateLabelNow, syncedTrips],
  );
  const over30DaysTrips = useMemo(
    () => syncedTrips.filter((item) => getTripDaysAgo(item) >= 30),
    [dateLabelNow, syncedTrips],
  );
  const visibleSyncedTrips = useMemo(() => {
    if (listTab === 'THIS_WEEK') return thisWeekTrips;
    if (listTab === 'LAST_WEEK') return lastWeekTrips;
    if (listTab === 'OVER_30') return over30DaysTrips;
    return syncedTrips;
  }, [listTab, over30DaysTrips, syncedTrips, thisWeekTrips, lastWeekTrips]);

  const searchedSyncedTrips = useMemo(
    () => visibleSyncedTrips.filter(matchesTripQuery),
    [matchesTripQuery, visibleSyncedTrips],
  );
  const unsyncedOfflineTrips = useMemo(
    () =>
      tripHistory
        .filter(isOfflineSavedUnsyncedTrip)
        .filter(matchesTripQuery)
        .sort((left, right) => {
          const leftTime = new Date(left.startedAt ?? `${left.tripDate}T00:00:00`).getTime();
          const rightTime = new Date(right.startedAt ?? `${right.tripDate}T00:00:00`).getTime();
          return rightTime - leftTime;
        }),
    [isOfflineSavedUnsyncedTrip, matchesTripQuery, tripHistory],
  );
  const activeTripHistory = useMemo(
    () =>
      searchedSyncedTrips.filter(
        (trip) => getTripLocalDateKey(trip) === getLocalDateKey(dateLabelNow),
      ),
    [dateLabelNow, searchedSyncedTrips],
  );
  const pastTripHistory = useMemo(
    () =>
      searchedSyncedTrips.filter(
        (trip) => getTripLocalDateKey(trip) < getLocalDateKey(dateLabelNow),
      ),
    [dateLabelNow, searchedSyncedTrips],
  );
  const manageableTripIds = useMemo(
    () => searchedSyncedTrips.map((trip) => trip.id),
    [searchedSyncedTrips],
  );
  const hasManageableTrips = manageableTripIds.length > 0;
  const selectedTripCount = selectedTripIds.length;
  const allVisibleTripsSelected =
    hasManageableTrips && manageableTripIds.every((tripId) => selectedTripIds.includes(tripId));
  const shouldShowUnsyncedTrips = listTab === 'ALL' || listTab === 'UNSYNCED';
  const shouldShowSyncedTrips = listTab !== 'UNSYNCED';

  const toggleTripSelection = (tripId: string) => {
    setSelectedTripIds((current) =>
      current.includes(tripId)
        ? current.filter((selectedId) => selectedId !== tripId)
        : [...current, tripId],
    );
  };








  const handleTripRowPress = (trip: TripHistoryItem) => {
    if (isManagingTrips) {
      if (manageableTripIds.includes(trip.id)) {
        toggleTripSelection(trip.id);
      }
      return;
    }

    setSelectedTrip(trip);
  };

  const handleToggleManageTrips = () => {
    setIsManagingTrips((current) => {
      if (current) {
        setSelectedTripIds([]);
      }
      return !current;
    });
  };

  const handleSelectAllVisibleTrips = () => {
    setSelectedTripIds((current) => {
      if (allVisibleTripsSelected) {
        return current.filter((tripId) => !manageableTripIds.includes(tripId));
      }

      return Array.from(new Set([...current, ...manageableTripIds]));
    });
  };

  const deleteTrips = async (tripIds: string[]) => {
    if (tripIds.length === 0 || !onDeleteTrip || isDeletingTrips) {
      return;
    }

    setIsDeletingTrips(true);
    try {
      for (const tripId of tripIds) {
        await onDeleteTrip(tripId);
      }
      setSelectedTripIds((current) => current.filter((tripId) => !tripIds.includes(tripId)));
      if (tripIds.length === manageableTripIds.length) {
        setIsManagingTrips(false);
      }
    } finally {
      setIsDeletingTrips(false);
    }
  };

  const confirmDeleteTrips = (tripIds: string[], title: string, message: string) => {
    if (tripIds.length === 0 || !onDeleteTrip || isDeletingTrips) {
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteTrips(tripIds);
        },
      },
    ]);
  };

  return (
    <View style={[styles.homeScreen, isLowBatteryTheme ? localStyles.lowBatteryScreen : null]}>
      <View style={[styles.homeContentArea, isLowBatteryTheme ? localStyles.lowBatteryScreen : null]}>
        {selectedTrip ? (
          <CompletedTripDetailScreen
            selectedTrip={selectedTrip}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            isLowBatteryMapMode={isLowBatteryMapMode}
            onRoadMatchOfflineTrip={onRoadMatchOfflineTrip}
            onSyncOfflineTrip={onSyncOfflineTrip}
            onBack={() => setSelectedTrip(null)}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[
              localStyles.scrollContent,
              {
                paddingTop: 16 + (insets.top || 0),
                paddingBottom: 140 + (insets.bottom || 0),
              },
              isLowBatteryTheme ? localStyles.lowBatteryScrollContent : null,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={localStyles.listHeaderRow}>
              <Pressable
                style={[localStyles.iconGhost, isLowBatteryTheme ? localStyles.lowBatterySurface : null]}
                onPress={() => onNavigate?.('home')}
              >
                <AppIcon name="chevron-left" size={18} color={isLowBatteryTheme ? '#E5E7EB' : '#0F172A'} />
              </Pressable>
              <View style={localStyles.headerCopy}>
                <Text style={[localStyles.headerTitle, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>
                  Trip History
                </Text>
              </View>
              <View style={localStyles.headerRightSpacer} />
            </View>

            <View style={[localStyles.searchCard, isLowBatteryTheme ? localStyles.lowBatterySurface : null]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={isLowBatteryTheme ? MAXIM_UI_SUBTLE_DARK : '#98A3B3'}
                style={[localStyles.searchInput, isLowBatteryTheme ? localStyles.lowBatteryText : null]}
              />
              <AppIcon
                name="search"
                size={16}
                color={isLowBatteryTheme ? MAXIM_UI_SUBTLE_DARK : '#64748B'}
              />
            </View>

            <View style={localStyles.tabsRow}>
              <Pressable
                style={[
                  localStyles.tabPill,
                  isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                  listTab === 'ALL' && localStyles.tabPillActive,
                  isLowBatteryTheme && listTab === 'ALL' ? localStyles.lowBatteryTabPillActive : null,
                ]}
                onPress={() => setListTab('ALL')}
              >
                <Text style={[
                  localStyles.tabText,
                  isLowBatteryTheme ? localStyles.lowBatteryMutedText : null,
                  listTab === 'ALL' && localStyles.tabTextActive,
                  isLowBatteryTheme && listTab === 'ALL' ? localStyles.lowBatteryTabTextActive : null,
                ]}>All</Text>
              </Pressable>
              <Pressable
                style={[
                  localStyles.tabPill,
                  isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                  listTab === 'THIS_WEEK' && localStyles.tabPillActive,
                  isLowBatteryTheme && listTab === 'THIS_WEEK' ? localStyles.lowBatteryTabPillActive : null,
                ]}
                onPress={() => setListTab('THIS_WEEK')}
              >
                <Text style={[
                  localStyles.tabText,
                  isLowBatteryTheme ? localStyles.lowBatteryMutedText : null,
                  listTab === 'THIS_WEEK' && localStyles.tabTextActive,
                  isLowBatteryTheme && listTab === 'THIS_WEEK' ? localStyles.lowBatteryTabTextActive : null,
                ]}>
                  This Week
                </Text>
              </Pressable>
              <Pressable
                style={[
                  localStyles.tabPill,
                  isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                  listTab === 'LAST_WEEK' && localStyles.tabPillActive,
                  isLowBatteryTheme && listTab === 'LAST_WEEK' ? localStyles.lowBatteryTabPillActive : null,
                ]}
                onPress={() => setListTab('LAST_WEEK')}
              >
                <Text style={[
                  localStyles.tabText,
                  isLowBatteryTheme ? localStyles.lowBatteryMutedText : null,
                  listTab === 'LAST_WEEK' && localStyles.tabTextActive,
                  isLowBatteryTheme && listTab === 'LAST_WEEK' ? localStyles.lowBatteryTabTextActive : null,
                ]}>
                  Last Week
                </Text>
              </Pressable>
              <Pressable
                style={[
                  localStyles.tabPill,
                  isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                  listTab === 'OVER_30' && localStyles.tabPillActive,
                  isLowBatteryTheme && listTab === 'OVER_30' ? localStyles.lowBatteryTabPillActive : null,
                ]}
                onPress={() => setListTab('OVER_30')}
              >
                <Text style={[
                  localStyles.tabText,
                  isLowBatteryTheme ? localStyles.lowBatteryMutedText : null,
                  listTab === 'OVER_30' && localStyles.tabTextActive,
                  isLowBatteryTheme && listTab === 'OVER_30' ? localStyles.lowBatteryTabTextActive : null,
                ]}>
                  30+ Days
                </Text>
              </Pressable>
              <Pressable
                style={[
                  localStyles.tabPill,
                  isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                  listTab === 'UNSYNCED' && localStyles.tabPillActive,
                  isLowBatteryTheme && listTab === 'UNSYNCED' ? localStyles.lowBatteryTabPillActive : null,
                ]}
                onPress={() => setListTab('UNSYNCED')}
              >
                <Text style={[
                  localStyles.tabText,
                  isLowBatteryTheme ? localStyles.lowBatteryMutedText : null,
                  listTab === 'UNSYNCED' && localStyles.tabTextActive,
                  isLowBatteryTheme && listTab === 'UNSYNCED' ? localStyles.lowBatteryTabTextActive : null,
                ]}>
                  Unsynced
                </Text>
              </Pressable>
            </View>



            <>
                {shouldShowUnsyncedTrips && unsyncedOfflineTrips.length > 0 ? (
                  <View style={localStyles.orderSection}>
                    <Text style={[localStyles.orderSectionTitle, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>
                      Unsynced Trips
                    </Text>
                    {unsyncedOfflineTrips.map((trip) => (
                      <Pressable
                        key={trip.id}
                        style={[
                          localStyles.tripRow,
                          localStyles.unsyncedOfflineTripRow,
                          isLowBatteryTheme ? localStyles.lowBatteryTripRow : null,
                        ]}
                        onPress={() => handleTripRowPress(trip)}
                      >
                        <TripCardContent
                          trip={trip}
                          isSelected={false}
                          allowSelection={false}
                          showSyncPill
                          showRawGpsMeta
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {listTab === 'UNSYNCED' && unsyncedOfflineTrips.length === 0 ? (
                  <View style={[localStyles.emptySection, isLowBatteryTheme ? localStyles.lowBatterySurfaceAlt : null]}>
                    <Text style={[localStyles.emptyText, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>
                      No unsynced trips
                    </Text>
                  </View>
                ) : null}

                {shouldShowSyncedTrips ? (
                  <>
                    <View style={localStyles.orderSection}>
                      <View style={localStyles.completedSectionHeader}>
                        <Text style={[localStyles.orderSectionTitle, localStyles.completedSectionTitle, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>
                          Today's Trip
                        </Text>
                        <Pressable
                          style={[
                            localStyles.manageTripsButton,
                            isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                            (!hasManageableTrips || !onDeleteTrip || isDeletingTrips)
                              ? localStyles.manageTripsButtonDisabled
                              : null,
                          ]}
                          onPress={handleToggleManageTrips}
                          disabled={!hasManageableTrips || !onDeleteTrip || isDeletingTrips}
                        >
                          <Text
                            style={[
                              localStyles.manageTripsButtonText,
                              isLowBatteryTheme ? localStyles.lowBatteryText : null,
                              isManagingTrips ? localStyles.manageTripsButtonTextActive : null,
                            ]}
                          >
                            {isManagingTrips ? 'Done' : 'Select'}
                          </Text>
                        </Pressable>
                      </View>
                      {isManagingTrips ? (
                        <View style={localStyles.manageTripsToolbar}>
                          <Pressable
                            style={[localStyles.manageTripsToolbarButton, isLowBatteryTheme ? localStyles.lowBatterySurface : null]}
                            onPress={handleSelectAllVisibleTrips}
                            disabled={isDeletingTrips}
                          >
                            <Text style={[localStyles.manageTripsToolbarText, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>
                              {allVisibleTripsSelected ? 'Clear' : 'Select all'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              localStyles.manageTripsToolbarButton,
                              isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                              selectedTripCount === 0 || isDeletingTrips ? localStyles.manageTripsButtonDisabled : null,
                            ]}
                            onPress={() =>
                              confirmDeleteTrips(
                                selectedTripIds,
                                'Delete selected trips?',
                                `Delete ${selectedTripCount} selected trip${selectedTripCount === 1 ? '' : 's'}?`,
                              )
                            }
                            disabled={selectedTripCount === 0 || isDeletingTrips}
                          >
                            <Text style={[localStyles.manageTripsToolbarText, isLowBatteryTheme ? localStyles.lowBatteryText : null, localStyles.manageTripsDeleteText]}>
                              Delete selected
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[
                              localStyles.manageTripsToolbarButton,
                              isLowBatteryTheme ? localStyles.lowBatterySurface : null,
                              manageableTripIds.length === 0 || isDeletingTrips ? localStyles.manageTripsButtonDisabled : null,
                            ]}
                            onPress={() =>
                              confirmDeleteTrips(
                                manageableTripIds,
                                'Delete all trips?',
                                'Delete every synced trip currently shown?',
                              )
                            }
                            disabled={manageableTripIds.length === 0 || isDeletingTrips}
                          >
                            <Text style={[localStyles.manageTripsToolbarText, isLowBatteryTheme ? localStyles.lowBatteryText : null, localStyles.manageTripsDeleteText]}>
                              Delete all
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {activeTripHistory.length === 0 ? (
                        <View style={[localStyles.emptySection, isLowBatteryTheme ? localStyles.lowBatterySurface : null]}>
                          <Text style={[localStyles.emptyText, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>No trips from today in this section</Text>
                        </View>
                      ) : (
                        activeTripHistory.map((trip) => (
                          <Pressable
                            key={trip.id}
                            style={[
                              localStyles.tripRow,
                              isLowBatteryTheme ? localStyles.lowBatteryTripRow : null,
                              isManagingTrips && selectedTripIds.includes(trip.id) ? localStyles.tripRowSelected : null,
                            ]}
                            onPress={() => handleTripRowPress(trip)}
                          >
                            <TripCardContent trip={trip} isSelected={selectedTripIds.includes(trip.id)} />
                          </Pressable>
                        ))
                      )}
                    </View>

                    <View style={localStyles.orderSection}>
                      <Text style={[localStyles.orderSectionTitle, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>Past Trips</Text>
                      {pastTripHistory.length === 0 ? (
                        <View style={[localStyles.emptySection, isLowBatteryTheme ? localStyles.lowBatterySurface : null]}>
                          <Text style={[localStyles.emptyText, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>No trips from yesterday or earlier in this section</Text>
                        </View>
                      ) : (
                        pastTripHistory.map((trip) => (
                          <Pressable
                            key={trip.id}
                            style={[
                              localStyles.tripRow,
                              isLowBatteryTheme ? localStyles.lowBatteryTripRow : null,
                              isManagingTrips && selectedTripIds.includes(trip.id) ? localStyles.tripRowSelected : null,
                            ]}
                            onPress={() => handleTripRowPress(trip)}
                          >
                            <TripCardContent trip={trip} isSelected={selectedTripIds.includes(trip.id)} />
                          </Pressable>
                        ))
                      )}
                    </View>
                  </>
                ) : null}
              </>
          </ScrollView>
        )}
      </View>

      {!selectedTrip ? (
        <HomeNavigationCard
          activeTab={activeTab}
          onNavigate={onNavigate}
          showCenterRoute={false}
          isLowBatteryMapMode={isLowBatteryMapMode}
          styles={styles}
        />
      ) : null}
    </View>
  );

  function TripCardContent({
    trip,
    isSelected,
    allowSelection = true,
    showSyncPill = false,
    showRawGpsMeta = false,
  }: {
    trip: TripHistoryItem;
    isSelected: boolean;
    allowSelection?: boolean;
    showSyncPill?: boolean;
    showRawGpsMeta?: boolean;
  }) {
    const rawGpsCount = Math.max(
      Number.isFinite(trip.rawGpsPointCount) ? trip.rawGpsPointCount : 0,
      trip.rawTelemetry.length,
    );
    const syncLabel =
      trip.offlineSyncStatus === 'syncing'
        ? 'Syncing'
        : trip.offlineSyncStatus === 'failed'
          ? 'Failed'
          : trip.syncStatus === 'SYNC_PENDING'
            ? 'Unsynced'
            : 'Synced';
    const statusLabel =
      trip.syncStatus === 'SYNCED'
        ? 'Completed'
        : trip.offlineSyncStatus === 'syncing'
          ? 'Syncing'
          : trip.offlineSyncStatus === 'failed'
            ? 'Unsynced'
            : trip.offlineSegmentsCount > 0
              ? 'Offline'
              : 'Unsynced';

    return (
      <View style={localStyles.tripRowInner}>
        {isManagingTrips && allowSelection ? (
          <View style={[localStyles.tripSelectControl, isSelected ? localStyles.tripSelectControlActive : null]}>
            {isSelected ? <AppIcon name="check" size={12} color="#FFFFFF" /> : null}
          </View>
        ) : null}
        <View style={localStyles.tripTimeline}>
          <View style={[localStyles.tripTimelineIcon, localStyles.tripTimelineIconPickup]}>
            <AppIcon name="navigation" size={10} color="#16A34A" />
          </View>
          <View style={[localStyles.tripTimelineConnector, isLowBatteryTheme ? localStyles.lowBatteryTripTimelineConnector : null]} />
          <View style={[localStyles.tripTimelineIcon, localStyles.tripTimelineIconDestination]}>
            <AppIcon name="map-pin" size={10} color="#EF4444" />
          </View>
        </View>
        <View style={localStyles.tripRowMain}>
          <View style={localStyles.tripOrderBody}>
            <View style={localStyles.tripAddressStack}>
              <View style={localStyles.tripAddressBlock}>
                <Text style={[localStyles.tripAddressLabel, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>Starting point</Text>
                <Text style={[localStyles.tripAddressText, isLowBatteryTheme ? localStyles.lowBatteryText : null]} numberOfLines={1}>
                  {getPickupLabel(trip)}
                </Text>
              </View>
              <View style={localStyles.tripAddressBlock}>
                <Text style={[localStyles.tripAddressLabel, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>End point</Text>
                <Text style={[localStyles.tripAddressText, isLowBatteryTheme ? localStyles.lowBatteryText : null]} numberOfLines={1}>
                  {getDestinationLabel(trip)}
                </Text>
              </View>
            </View>

            <View style={localStyles.tripMetricStack}>
              <View style={localStyles.tripMetricBlock}>
                <Text style={[localStyles.tripMetricLabel, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>Fare</Text>
                <Text style={localStyles.tripPaymentPill}>{trip.fare}</Text>
              </View>
              <View style={localStyles.tripMetricBlock}>
                <Text style={[localStyles.tripMetricLabel, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>Distance</Text>
                <Text style={[localStyles.tripDistanceValue, isLowBatteryTheme ? localStyles.lowBatteryText : null]}>{trip.distance}</Text>
              </View>
            </View>
          </View>

          <View style={[localStyles.tripOrderFooter, isLowBatteryTheme ? localStyles.lowBatteryTripOrderFooter : null]}>
            <View style={localStyles.tripFooterCopy}>
              <Text style={[localStyles.tripRowMetaText, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]} numberOfLines={1}>
                {formatTripDateForCard(trip)} - {trip.duration}
                {showRawGpsMeta ? ` - Saved locally (${rawGpsCount} point${rawGpsCount === 1 ? '' : 's'})` : ''}
              </Text>
              {showSyncPill ? (
                <View
                  style={[
                    localStyles.tripSyncPill,
                    isLowBatteryTheme ? localStyles.lowBatteryPill : null,
                    trip.syncStatus === 'SYNC_PENDING' ? localStyles.tripSyncPillPending : null,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.tripSyncPillText,
                      trip.syncStatus === 'SYNC_PENDING' ? localStyles.tripSyncPillTextPending : null,
                    ]}
                  >
                  {syncLabel}
                </Text>
              </View>
            ) : null}
            {trip.status === 'COMPLETED' ? (
              <View style={[localStyles.tripCompletedRoutePill, isLowBatteryTheme ? localStyles.lowBatteryPill : null]}>
                <Text style={[localStyles.tripCompletedRoutePillText, isLowBatteryTheme ? localStyles.lowBatteryMutedText : null]}>
                  {statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      </View>
    );
  }

}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 140,
    backgroundColor: '#F4F6FA',
  },
  lowBatteryScreen: {
    backgroundColor: '#1D222B',
  },
  lowBatteryScrollContent: {
    backgroundColor: '#1D222B',
  },
  lowBatterySurface: {
    backgroundColor: '#2A303B',
    borderColor: '#434D5C',
    shadowOpacity: 0,
    elevation: 0,
  },
  lowBatterySurfaceAlt: {
    backgroundColor: '#232933',
    borderColor: '#353E4C',
  },
  lowBatteryWarningSurface: {
    backgroundColor: '#3A3325',
    borderColor: '#F4D24E',
  },
  lowBatteryText: {
    color: '#F4F7FB',
  },
  lowBatteryMutedText: {
    color: '#B7C1CF',
  },
  lowBatteryWarningText: {
    color: '#F4D24E',
  },
  lowBatteryTabPillActive: {
    backgroundColor: 'rgba(87,199,168,0.16)',
    borderColor: 'rgba(87,199,168,0.32)',
  },
  lowBatteryTabTextActive: {
    color: '#F4D24E',
  },
  lowBatteryTripRow: {
    backgroundColor: '#2A303B',
    borderColor: '#434D5C',
    shadowOpacity: 0,
    elevation: 0,
  },
  lowBatteryTripTimelineConnector: {
    borderColor: '#8F9BAA',
  },
  lowBatteryTripOrderFooter: {
    borderTopColor: '#434D5C',
  },
  lowBatteryPill: {
    backgroundColor: '#232933',
    borderColor: '#4B5665',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  iconGhost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  iconGhostDisabled: {
    opacity: 0.55,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerRightSpacer: {
    width: 36,
    height: 36,
  },
  historyMasthead: {
    marginBottom: 18,
    paddingTop: 6,
    paddingBottom: 4,
  },
  historyEyebrow: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#2563EB',
    fontFamily: 'CircularStdMedium500',
  },
  historyHeroTitle: {
    marginTop: 8,
    fontSize: 30,
    lineHeight: 34,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  historyHeroSub: {
    marginTop: 8,
    maxWidth: 280,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  searchCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    paddingVertical: 0,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  listSub: {
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
    flexWrap: 'wrap',
  },
  tabPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  tabText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tabTextActive: {
    color: '#1D4ED8',
  },
  emptySection: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  orderSection: {
    marginBottom: 12,
  },
  unsyncedOfflineTripRow: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFBF5',
  },
  orderSectionTitle: {
    marginBottom: 8,
    fontSize: 16,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  completedSectionTitle: {
    flex: 1,
    marginBottom: 0,
    fontSize: 20,
    lineHeight: 25,
  },
  completedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  manageTripsButton: {
    minWidth: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageTripsButtonDisabled: {
    opacity: 0.45,
  },
  manageTripsButtonText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  manageTripsButtonTextActive: {
    color: '#DC2626',
  },
  manageTripsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  manageTripsToolbarButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  manageTripsToolbarText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  manageTripsDeleteText: {
    color: '#DC2626',
  },
  tripRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  tripRowSelected: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFBFB',
  },
  tripRowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tripSelectControl: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  tripSelectControlActive: {
    borderColor: '#DC2626',
    backgroundColor: '#DC2626',
  },
  tripTimeline: {
    width: 24,
    alignItems: 'center',
    marginRight: 10,
  },
  tripTimelineIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tripTimelineIconPickup: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  tripTimelineIconDestination: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  tripTimelineConnector: {
    height: 34,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#111827',
    backgroundColor: 'transparent',
  },
  tripRowBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tripRowMain: {
    flex: 1,
    minWidth: 0,
  },
  tripOrderBody: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 78,
  },
  tripAddressStack: {
    flex: 1,
    minWidth: 0,
    height: 78,
    justifyContent: 'space-between',
  },
  tripAddressBlock: {
    height: 34,
    justifyContent: 'center',
  },
  tripAddressText: {
    fontSize: 16,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripAddressLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  tripMetricStack: {
    width: 126,
    height: 78,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tripMetricBlock: {
    width: 92,
    height: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  tripMetricLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 1,
    textAlign: 'right',
  },
  tripPaymentPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 0,
    backgroundColor: '#E3F8EC',
    color: '#146C43',
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
    overflow: 'hidden',
  },
  tripDistanceValue: {
    fontSize: 15,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  tripOrderFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tripFooterCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  routeSourcePill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  routeSourcePillOsrm: {
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
  },
  routeSourcePillText: {
    fontSize: 9,
    lineHeight: 11,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  routeSourcePillTextOsrm: {
    color: '#0369A1',
  },
  tripCompletedRoutePill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tripCompletedRoutePillText: {
    fontSize: 9,
    lineHeight: 11,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripSyncPill: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tripSyncPillPending: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  tripSyncPillText: {
    fontSize: 9,
    lineHeight: 11,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripSyncPillTextPending: {
    color: '#B45309',
  },
  tripCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  tripRowTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  tripRowTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tripStatusText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 62,
  },
  tripRowMeta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  tripRouteSummary: {
    marginTop: 10,
    gap: 6,
  },
  tripRouteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripRouteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripRouteDotPickup: {
    backgroundColor: '#0EA5E9',
  },
  tripRouteDotDestination: {
    backgroundColor: '#0F172A',
  },
  tripRouteLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripUtilityRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  tripRouteQualityPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: 130,
  },
  tripRouteQualityText: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'CircularStdMedium500',
  },
  tripSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tripSyncButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  tripSyncButtonText: {
    fontSize: 9,
    lineHeight: 11,
    color: '#075985',
    fontFamily: 'CircularStdMedium500',
  },
  tripSyncButtonTextDisabled: {
    color: '#94A3B8',
  },
  tripRowMetaText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowDistance: {
    fontSize: 12,
    lineHeight: 15,
    color: '#2563EB',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowDot: {
    fontSize: 11,
    lineHeight: 15,
    color: '#CBD5E1',
    fontFamily: 'CircularStdMedium500',
  },
  tripRowFare: {
    marginTop: 12,
    fontSize: 22,
    lineHeight: 26,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#F4F6FA',
  },
  detailMapContainer: {
    ...StyleSheet.absoluteFillObject,
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
  detailBottomSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F4F6FA',
  },
  detailBackFloating: {
    position: 'absolute',
    top: 18,
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
    paddingBottom: 4,
  },
  rideSummaryCard: {
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  rideSummaryTripRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  rideDriverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  rideVehicleInfo: {
    maxWidth: 118,
    alignItems: 'flex-end',
  },
  rideVehicleText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideVehicleSub: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
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
  rideStatusMeta: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  rideMetricCell: {
    width: '33.333%',
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
  detailHeaderBlock: {
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripIdPill: {
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
    backgroundColor: '#E2E8F0',
  },
  detailDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
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
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
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
  routeQualityPill: {
    alignSelf: 'flex-start',
    marginTop: -2,
    marginBottom: 14,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  routeQualityPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  primaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  primaryStatCard: {
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
  },
  primaryStatIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  primaryStatLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  primaryStatValue: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  detailSection: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  detailSectionTitle: {
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
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
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  detailInfoValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
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
