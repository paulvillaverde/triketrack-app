import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { SubmitAppealModal } from '../components/modals';
import { listViolations, submitViolationAppeal } from '../supabase';

type ViolationScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  driverDbId?: number | null;
  styles: Record<string, any>;
};

export type ViolationStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

export type ViolationItem = {
  id: string;
  title: string;
  date: string;
  location: string;
  details: string;
  status: ViolationStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
};

export const VIOLATION_ITEMS: ViolationItem[] = [
  {
    id: 'VL-3021',
    title: 'Geofence Boundary Violation',
    date: 'Mar 12, 2026 - 3:00 PM',
    location: 'Uyanguren Market',
    details: 'Driver left authorized route 1B-8 for 5 mins.',
    status: 'OPEN',
    priority: 'HIGH',
  },
  {
    id: 'VL-3020',
    title: 'Route Deviation Alert',
    date: 'Mar 11, 2026 - 4:35 PM',
    location: 'Agdao Overpass',
    details: 'Unplanned detour detected for 10 mins.',
    status: 'UNDER_REVIEW',
    priority: 'MEDIUM',
  },
  {
    id: 'VL-3019',
    title: 'Unauthorized Stop',
    date: 'Mar 09, 2026 - 6:42 PM',
    location: 'Roxas Avenue',
    details: 'Stop event outside allowed boundary zone.',
    status: 'OPEN',
    priority: 'HIGH',
  },
  {
    id: 'VL-3018',
    title: 'Repeated Geofence Exit',
    date: 'Mar 08, 2026 - 9:18 PM',
    location: 'Obrero Boundary',
    details: 'Multiple boundary exits detected during active trip session.',
    status: 'UNDER_REVIEW',
    priority: 'MEDIUM',
  },
];

export function ViolationScreen({
  onLogout: _onLogout,
  onNavigate,
  driverDbId,
  styles,
}: ViolationScreenProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'TAKE_ACTION' | 'RESOLVED'>('ALL');
  const [selectedViolation, setSelectedViolation] = useState<ViolationItem | null>(null);
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [violationItems, setViolationItems] = useState<ViolationItem[]>(VIOLATION_ITEMS);
  const [violationsLoaded, setViolationsLoaded] = useState(false);
  const appealReasons = [
    'I did not notice I was outside the geofence.',
    'GPS/location signal was unstable.',
    'Passenger requested a reroute.',
    'Road closure or traffic enforcement detour.',
    'Emergency situation while on trip.',
    'Other operational issue.',
  ];
  const rows = useMemo(
    () =>
      violationItems.filter((item) => {
        if (filter === 'RESOLVED' && item.status !== 'RESOLVED') return false;
        if (filter === 'TAKE_ACTION' && item.status === 'RESOLVED') return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q)
        );
      }),
    [violationItems, filter, query],
  );

  const formatViolationDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()] ?? 'Jan';
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${month} ${dd}, ${yyyy} - ${hours}:${minutes} ${ampm}`;
  };

  const violationTitleForType = (type: string) => {
    if (type === 'GEOFENCE_BOUNDARY') return 'Geofence Boundary Violation';
    if (type === 'ROUTE_DEVIATION') return 'Route Deviation Alert';
    if (type === 'UNAUTHORIZED_STOP') return 'Unauthorized Stop';
    return 'Route Violation';
  };

  useEffect(() => {
    if (driverDbId === null || typeof driverDbId === 'undefined') {
      return;
    }

    const load = async () => {
      const { violations, error } = await listViolations(driverDbId);
      if (error) {
        setViolationsLoaded(true);
        return;
      }

      setViolationItems(
        violations.map((v) => ({
          id: v.id,
          title: v.title ?? violationTitleForType(v.type),
          date: formatViolationDate(v.occurred_at),
          location: v.location_label ?? '—',
          details: v.details ?? '—',
          status: v.status,
          priority: v.priority,
        })),
      );
      setViolationsLoaded(true);
    };

    void load();
  }, [driverDbId]);
  const openAppealModal = (item: ViolationItem) => {
    setSelectedViolation(item);
    setSelectedReason('');
    setDetails('');
    setShowAppealModal(true);
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={localStyles.headerRow}>
            <Pressable style={localStyles.iconGhost} onPress={() => onNavigate?.('home')}>
              <Feather name="chevron-left" size={18} color="#111827" />
            </Pressable>
            <Text style={localStyles.headerTitle}>Violation History</Text>
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

          <Text style={localStyles.listSub}>Showing all your violation records</Text>

          <View style={localStyles.filterRow}>
            <Pressable
              style={[localStyles.filterPill, filter === 'ALL' && localStyles.filterPillActive]}
              onPress={() => setFilter('ALL')}
            >
              <Text style={[localStyles.filterText, filter === 'ALL' && localStyles.filterTextActive]}>
                All
              </Text>
            </Pressable>
            <Pressable
              style={[localStyles.filterPill, filter === 'TAKE_ACTION' && localStyles.filterPillActive]}
              onPress={() => setFilter('TAKE_ACTION')}
            >
              <Text
                style={[localStyles.filterText, filter === 'TAKE_ACTION' && localStyles.filterTextActive]}
              >
                Take Action
              </Text>
            </Pressable>
            <Pressable
              style={[localStyles.filterPill, filter === 'RESOLVED' && localStyles.filterPillActive]}
              onPress={() => setFilter('RESOLVED')}
            >
              <Text
                style={[localStyles.filterText, filter === 'RESOLVED' && localStyles.filterTextActive]}
              >
                Resolved
              </Text>
            </Pressable>
          </View>

          {rows.map((item) => {
            const isResolved = item.status === 'RESOLVED';
            const statusLabel = isResolved ? 'RESOLVED' : 'TAKE ACTION';
            const statusColor = isResolved ? '#57c7a8' : '#EF4444';
            const [datePartRaw, timePartRaw] = item.date.split('-');
            const datePart = datePartRaw?.trim() ?? item.date;
            const timePart = timePartRaw?.trim() ?? '--:--';
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (!isResolved) {
                    openAppealModal(item);
                  }
                }}
                style={[
                  localStyles.invoiceCard,
                  { borderColor: isResolved ? '#57c7a8' : '#F4A4A4' },
                ]}
              >
                <View style={localStyles.invoiceTop}>
                  <View style={localStyles.invoiceMetaHead}>
                    <Text style={localStyles.invoiceMetaLabel}>Reason</Text>
                    <Text style={localStyles.invoiceMetaValue} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={localStyles.invoiceMetaSub}>{item.id}</Text>
                  </View>
                  <View style={[localStyles.statusChip, { backgroundColor: statusColor }]}>
                    <Feather name={isResolved ? 'check' : 'x'} size={14} color="#FFFFFF" />
                    <Text style={localStyles.statusChipText}>{statusLabel}</Text>
                  </View>
                  <Pressable style={localStyles.stateActionWrap}>
                    <Feather
                      name={isResolved ? 'check-circle' : 'alert-circle'}
                      size={16}
                      color={isResolved ? '#57c7a8' : '#EF4444'}
                    />
                  </Pressable>
                </View>

                <View style={localStyles.infoRow}>
                  <View style={localStyles.infoItem}>
                    <View style={localStyles.infoHead}>
                      <Feather name="calendar" size={12} color="#6B7280" />
                      <Text style={localStyles.infoHeadText}>Date</Text>
                    </View>
                    <Text style={localStyles.infoValue}>{datePart}</Text>
                  </View>
                  <View style={localStyles.infoItem}>
                    <View style={localStyles.infoHead}>
                      <Feather name="clock" size={12} color="#6B7280" />
                      <Text style={localStyles.infoHeadText}>Time</Text>
                    </View>
                    <Text style={localStyles.infoValue}>{timePart}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <HomeNavigationCard
        activeTab="violation"
        onNavigate={onNavigate}
        showCenterRoute={false}
        styles={styles}
      />

      <SubmitAppealModal
        visible={showAppealModal}
        onRequestClose={() => setShowAppealModal(false)}
        selectedViolation={selectedViolation}
        appealReasons={appealReasons}
        selectedReason={selectedReason}
        setSelectedReason={setSelectedReason}
        details={details}
        setDetails={setDetails}
        onSubmit={async () => {
          if (driverDbId === null || typeof driverDbId === 'undefined') {
            return { error: null };
          }
          if (!selectedViolation) {
            return { error: 'No violation selected.' };
          }
          // Demo (offline) IDs won't exist in the database.
          if (selectedViolation.id.startsWith('VL-')) {
            return { error: null };
          }

          const { error } = await submitViolationAppeal({
            violationId: selectedViolation.id,
            driverId: driverDbId,
            reason: selectedReason,
            details,
          });

          return { error };
        }}
        onClose={() => setShowAppealModal(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 140,
    backgroundColor: '#F2F4F7',
  },
  headerRow: {
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
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    paddingVertical: 0,
    fontFamily: 'CircularStdMedium500',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  listSub: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6DFEE',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterPillActive: {
    backgroundColor: '#3F7DE8',
    borderColor: '#3F7DE8',
  },
  filterText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#54647A',
    fontFamily: 'CircularStdMedium500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  invoiceCard: {
    backgroundColor: '#EAF1FB',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 11,
    paddingHorizontal: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  invoiceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 4,
    marginTop: 2,
    marginRight: 6,
  },
  statusChipText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  invoiceMetaHead: {
    flex: 1,
    marginRight: 8,
  },
  invoiceMetaLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  invoiceMetaValue: {
    marginTop: 1,
    fontSize: 19,
    lineHeight: 23,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  invoiceMetaSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  stateActionWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCE7F5',
    paddingTop: 8,
  },
  infoItem: {
    width: '48%',
  },
  infoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  infoHeadText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#7C8798',
    fontFamily: 'CircularStdMedium500',
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
});
