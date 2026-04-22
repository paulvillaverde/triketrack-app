import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { OutsideGeofenceModal } from '../components/modals';
import { AppIcon, Avatar } from '../components/ui';
import type { TripCompletionPayload } from '../lib/tripTransactions';

type HomeScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  isTripScreen: boolean;
  isDriverOnline: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onBackToHome: () => void;
  locationEnabled: boolean;
  onTripComplete: (payload: TripCompletionPayload) => void;
  onTripStart?: (payload: {
    startLocation: { latitude: number; longitude: number } | null;
  }) => boolean | Promise<boolean>;
  onGeofenceExit?: (payload: { location: { latitude: number; longitude: number } | null }) => void;
  totalEarnings: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalMinutes: number;
  homeStatsFilter?: 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_30_DAYS';
  onChangeHomeStatsFilter?: (value: 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_30_DAYS') => void;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  isLowBatteryMapMode: boolean;
  styles: Record<string, any>;
};

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function HomeScreen({
  onNavigate,
  isTripScreen,
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  onBackToHome,
  onTripComplete,
  onTripStart,
  totalEarnings,
  totalTrips,
  totalDistanceKm,
  homeStatsFilter = 'TODAY',
  onChangeHomeStatsFilter,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  isLowBatteryMapMode,
  styles,
}: HomeScreenProps) {
  const filterLabel =
    homeStatsFilter === 'TODAY'
      ? 'Today'
      : homeStatsFilter === 'YESTERDAY'
        ? 'Yesterday'
        : homeStatsFilter === 'LAST_WEEK'
          ? 'Last Week'
          : 'Last 30 Days';
  const [showOutsideGeofenceModal, setShowOutsideGeofenceModal] = useState(false);
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [selectedFare, setSelectedFare] = useState(10);

  const handleTripButtonPress = async () => {
    if (!isTripStarted) {
      const canStartTrip = (await onTripStart?.({ startLocation: null })) ?? true;
      if (!canStartTrip) {
        return;
      }
      setIsTripStarted(true);
      return;
    }

    setIsTripStarted(false);
    onTripComplete({
      fare: selectedFare,
      distanceKm: 0,
      durationSeconds: 0,
      routePath: [],
      endLocation: null,
    });
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <View style={localStyles.mapFallback}>
          <View style={localStyles.previewBadge}>
            <Text style={localStyles.previewBadgeText}>Web Preview</Text>
          </View>
          <AppIcon name="map" size={34} color="#57c7a8" />
          <Text style={localStyles.mapFallbackTitle}>Native map is available on mobile</Text>
          <Text style={localStyles.mapFallbackSub}>
            This web fallback keeps the app runnable without the native mobile map SDK.
          </Text>
        </View>

        {!isTripScreen ? (
          <>
            <View style={localStyles.statusBarCard}>
              <Text style={localStyles.statusTitle}>{isDriverOnline ? 'Online' : 'Offline'}</Text>
              <View style={localStyles.statusActions}>
                <Pressable
                  style={localStyles.statusIconButton}
                  onPress={() => Alert.alert('Notifications', 'No notifications yet.')}
                >
                  <AppIcon name="bell" size={16} color="#0F172A" />
                </Pressable>
                <Pressable
                  style={[
                    localStyles.statusToggle,
                    isDriverOnline ? localStyles.statusToggleOn : localStyles.statusToggleOff,
                  ]}
                  onPress={() => {
                    if (isDriverOnline) {
                      onGoOffline();
                      return;
                    }
                    onGoOnline();
                  }}
                >
                  <View
                    style={[
                      localStyles.statusToggleThumb,
                      isDriverOnline ? localStyles.statusToggleThumbOn : localStyles.statusToggleThumbOff,
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            {!isDriverOnline ? (
              <View style={localStyles.offlineBanner}>
                <AppIcon name="cloud-off" size={14} color="#FFFFFF" />
                <Text style={localStyles.offlineBannerText}>You are offline. Go online to start trips.</Text>
              </View>
            ) : null}

            <View style={localStyles.dashboardSheet}>
              <View style={localStyles.sheetHeaderRow}>
                <View style={localStyles.avatarChip}>
                  <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatarImage} />
                </View>
                <View style={localStyles.driverMeta}>
                  <Text style={localStyles.driverName} numberOfLines={1}>
                    {profileName}
                  </Text>
                  <Text style={localStyles.driverSub} numberOfLines={1}>
                    {profileDriverCode} • {profilePlateNumber}
                  </Text>
                </View>
                <Pressable
                  style={localStyles.statsFilterButton}
                  onPress={() => {
                    const order = ['TODAY', 'YESTERDAY', 'LAST_WEEK', 'LAST_30_DAYS'] as const;
                    const currentIndex = order.indexOf(homeStatsFilter);
                    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % order.length : 0;
                    onChangeHomeStatsFilter?.(order[nextIndex] ?? 'TODAY');
                  }}
                >
                  <Text style={localStyles.todayText}>{filterLabel}</Text>
                  <AppIcon
                    name="chevron-right"
                    size={14}
                    color="#334155"
                    style={{ transform: [{ rotate: '90deg' }] }}
                  />
                </Pressable>
              </View>

              <View style={localStyles.metricRow}>
                <View style={localStyles.metricCard}>
                  <Text style={localStyles.metricLabel}>Total earned</Text>
                  <Text style={localStyles.metricValue}>{formatPeso(totalEarnings)}</Text>
                </View>
                <View style={localStyles.metricCard}>
                  <Text style={localStyles.metricLabel}>Total trips</Text>
                  <Text style={localStyles.metricValue}>{totalTrips}</Text>
                </View>
                <View style={localStyles.metricCard}>
                  <Text style={localStyles.metricLabel}>Total distance</Text>
                  <Text style={localStyles.metricValue}>{totalDistanceKm.toFixed(2)} km</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <Pressable style={localStyles.routeBackButton} onPress={onBackToHome}>
              <AppIcon name="chevron-left" size={20} color="#030318" />
            </Pressable>

            <View style={localStyles.tripPanel}>
              <View style={localStyles.tripPanelTop}>
                <Text style={localStyles.tripPanelTitle}>Obrero Geofence</Text>
                <Pressable
                  style={localStyles.previewOutsideButton}
                  onPress={() => setShowOutsideGeofenceModal(true)}
                >
                  <Text style={localStyles.previewOutsideText}>Preview</Text>
                </Pressable>
              </View>
              <Text style={localStyles.tripMeta}>Web mode uses a non-map preview. Mobile keeps full tracking.</Text>
              <Pressable style={localStyles.tripAction} onPress={handleTripButtonPress}>
                <Text style={localStyles.tripActionText}>{isTripStarted ? 'End Trip' : 'Start Trip'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <HomeNavigationCard
        activeTab="home"
        onNavigate={onNavigate}
        showCenterRoute={!isTripScreen}
        isLowBatteryMapMode={isLowBatteryMapMode}
        styles={styles}
      />

      <OutsideGeofenceModal
        visible={showOutsideGeofenceModal}
        onRequestClose={() => setShowOutsideGeofenceModal(false)}
        onAcknowledge={() => setShowOutsideGeofenceModal(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EEF5F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  previewBadge: {
    backgroundColor: '#57c7a8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  mapFallbackTitle: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  mapFallbackSub: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  statusBarCard: {
    position: 'absolute',
    top: 8,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
  },
  statusTitle: {
    fontSize: 16,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    backgroundColor: '#FFFFFF',
  },
  statusToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  statusToggleOn: {
    backgroundColor: '#57c7a8',
  },
  statusToggleOff: {
    backgroundColor: '#CBD5E1',
  },
  statusToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  statusToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  statusToggleThumbOff: {
    alignSelf: 'flex-start',
  },
  offlineBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 58,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#57c7a8',
  },
  offlineBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  dashboardSheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 100,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#57c7a8',
    backgroundColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  driverMeta: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  todayText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  statsFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  metricCard: {
    alignItems: 'center',
    width: '31%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  metricValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 10,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  routeBackButton: {
    position: 'absolute',
    top: 18,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5ECF3',
  },
  tripPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 104,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF1',
    padding: 14,
  },
  tripPanelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripPanelTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 12,
  },
  previewOutsideButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  previewOutsideText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#B91C1C',
    fontFamily: 'CircularStdMedium500',
  },
  tripAction: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripActionText: {
    fontSize: 18,
    lineHeight: 21,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
});
