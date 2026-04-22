import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { VIOLATION_ITEMS } from './ViolationScreen';
import { MetricTile } from '../components/tiles/MetricTile';
import { AppIcon, Avatar } from '../components/ui';

type DashboardHomeScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  totalEarnings: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalMinutes: number;
  tripHistory: Array<{
    id: string;
    tripDate: string;
    duration: string;
    distance: string;
    fare: string;
  }>;
  isDriverOnline: boolean;
  onTurnOffline: () => void;
  profileName: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  styles: Record<string, any>;
};

const formatPeso = (amount: number) =>
  `\u20B1${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDateForRecent(tripDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${tripDate}T00:00:00`);
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  if (diffDays === 0) return `${mm}/${dd}/${yyyy} (Today)`;
  if (diffDays === 1) return `${mm}/${dd}/${yyyy} (Yesterday)`;
  return `${mm}/${dd}/${yyyy}`;
}

export function DashboardHomeScreen({
  onLogout,
  onNavigate,
  totalEarnings,
  totalTrips,
  totalDistanceKm,
  totalMinutes,
  tripHistory,
  isDriverOnline,
  onTurnOffline,
  profileName,
  profilePlateNumber,
  profileImageUri,
  styles,
}: DashboardHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const hoursOnline = (totalMinutes / 60).toFixed(1);
  const recentTrips = tripHistory.slice(0, 3);
  const recentViolations = VIOLATION_ITEMS.slice(0, 3);

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <ScrollView
          contentContainerStyle={[
            localStyles.scrollContent,
            {
              paddingTop: 10 + (insets.top || 0),
              paddingBottom: 150 + (insets.bottom || 0),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.headerCard}>
            <View style={localStyles.headerLeft}>
              <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.headerAvatar} />
              <View style={localStyles.headerMeta}>
                <Text style={localStyles.headerName} numberOfLines={1}>
                  {profileName}
                </Text>
                <Text style={localStyles.headerLicense} numberOfLines={1}>
                  Plate No. {profilePlateNumber}
                </Text>
              </View>
            </View>
            <Pressable style={localStyles.bellButton} onPress={onLogout}>
              <AppIcon name="bell" size={17} color="#1F2937" />
            </Pressable>
          </View>

          <View style={localStyles.statusCard}>
            <View>
              <Text style={localStyles.statusTitle}>Status: {isDriverOnline ? 'Online' : 'Offline'}</Text>
              <Text style={localStyles.statusSub}>Open to any trips</Text>
            </View>
            <Switch
              value={isDriverOnline}
              onValueChange={(next) => {
                if (!next && isDriverOnline) {
                  onTurnOffline();
                }
              }}
              trackColor={{ false: '#E5E7EB', true: '#BFEED8' }}
              thumbColor={isDriverOnline ? '#57c7a8' : '#F8FAFC'}
              ios_backgroundColor="#E5E7EB"
            />
          </View>

          <Text style={localStyles.sectionTitle}>Today&apos;s Performance</Text>
          <View style={localStyles.metricsGrid}>
            <MetricTile label="Trips" value={`${totalTrips}`} icon="navigation" styles={localStyles} />
            <MetricTile
              label="Distance"
              value={`${totalDistanceKm.toFixed(1)} km`}
              icon="map-pin"
              styles={localStyles}
            />
            <MetricTile label="Hours Online" value={`${hoursOnline} h`} icon="clock" styles={localStyles} />
            <MetricTile label="Earnings" value={formatPeso(totalEarnings)} icon="dollar-sign" styles={localStyles} />
          </View>

          <View style={localStyles.sectionHeaderRow}>
            <Text style={localStyles.sectionTitle}>Recent Trips</Text>
            <Pressable onPress={() => onNavigate?.('trip')}>
              <Text style={localStyles.seeAllText}>See All</Text>
            </Pressable>
          </View>
          <View style={localStyles.cardBlock}>
            {recentTrips.length === 0 ? (
              <View style={localStyles.emptyRow}>
                <Text style={localStyles.emptyText}>No recent trips yet</Text>
              </View>
            ) : (
              recentTrips.map((trip, idx) => (
                <View key={trip.id} style={[localStyles.row, idx === recentTrips.length - 1 && localStyles.rowLast]}>
                  <View style={localStyles.rowLeft}>
                    <View style={localStyles.rowIcon}>
                      <AppIcon name="navigation" size={13} color="#159A63" />
                    </View>
                    <View>
                      <Text style={localStyles.rowTitle}>Trip #{trip.id.replace(/^TRIP-/, '')}</Text>
                      <Text style={localStyles.rowMeta}>
                        {formatDateForRecent(trip.tripDate)} • {trip.distance}
                      </Text>
                    </View>
                  </View>
                  <Text style={localStyles.rowValue}>{trip.fare}</Text>
                </View>
              ))
            )}
          </View>

          <View style={localStyles.sectionHeaderRow}>
            <Text style={localStyles.sectionTitle}>Recent Violations</Text>
            <Pressable onPress={() => onNavigate?.('violation')}>
              <Text style={localStyles.seeAllText}>See All</Text>
            </Pressable>
          </View>
          <View style={localStyles.cardBlock}>
            {recentViolations.map((item, idx) => (
              <View key={item.id} style={[localStyles.row, idx === recentViolations.length - 1 && localStyles.rowLast]}>
                <View style={localStyles.rowLeft}>
                  <View
                    style={[
                      localStyles.rowIcon,
                      item.status === 'RESOLVED' && localStyles.rowIconResolved,
                      item.status !== 'RESOLVED' && localStyles.rowIconWarning,
                    ]}
                  >
                    <AppIcon
                      name={item.status === 'RESOLVED' ? 'check-circle' : 'alert-triangle'}
                      size={13}
                      color={item.status === 'RESOLVED' ? '#15803D' : '#B45309'}
                    />
                  </View>
                  <View>
                    <Text style={localStyles.rowTitle}>{item.title}</Text>
                    <Text style={localStyles.rowMeta}>{item.date}</Text>
                  </View>
                </View>
                <Text
                  style={[
                    localStyles.statusTag,
                    item.status === 'RESOLVED' ? localStyles.statusTagResolved : localStyles.statusTagAction,
                  ]}
                >
                  {item.status === 'RESOLVED' ? 'Resolved' : 'Take Action'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <HomeNavigationCard activeTab="home" onNavigate={onNavigate} styles={styles} />
    </View>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 150,
    backgroundColor: '#F4F7F6',
  },
  headerCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE8E4',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#57c7a8',
  },
  headerMeta: {
    marginLeft: 10,
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  headerLicense: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F8F7',
    borderWidth: 1,
    borderColor: '#DFE7E3',
  },
  statusCard: {
    borderRadius: 16,
    backgroundColor: '#57c7a8',
    borderWidth: 1,
    borderColor: '#2EA56E',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusTitle: {
    fontSize: 16,
    lineHeight: 19,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  statusSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#E9FFF4',
    fontFamily: 'CircularStdMedium500',
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metricTile: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE8E4',
    padding: 12,
    marginBottom: 10,
  },
  metricIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 19,
    lineHeight: 22,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  metricLabel: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#159A63',
    fontFamily: 'CircularStdMedium500',
  },
  cardBlock: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE8E4',
    borderRadius: 16,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2EF',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rowIconResolved: {
    backgroundColor: '#ECFDF5',
  },
  rowIconWarning: {
    backgroundColor: '#FFF7ED',
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 17,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  statusTag: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  statusTagResolved: {
    color: '#15803D',
    backgroundColor: '#ECFDF5',
  },
  statusTagAction: {
    color: '#B45309',
    backgroundColor: '#FFF7ED',
  },
  emptyRow: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
});
