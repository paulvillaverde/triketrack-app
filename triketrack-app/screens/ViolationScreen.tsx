import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OsmMapView, type OsmMapViewHandle } from '../components/maps/OsmMapView';
import {
  OSM_VECTOR_DARK_STYLE,
  OSM_LIGHT_BACKGROUND,
  OSM_MAXIM_DARK_BACKGROUND,
  OSM_VECTOR_LIGHT_STYLE_URL,
} from '../components/maps/osmTheme';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { AppIcon, Avatar } from '../components/ui';
import { submitViolationAppeal, uploadViolationProof, type ViolationAppealRecord, type ViolationProofRecord } from '../supabase';
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

type ViolationScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  driverDbId?: number | null;
  violationItems?: ViolationItem[];
  focusViolationRequest?: {
    violationId: string;
    requestedAt: number;
  } | null;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  isLowBatteryMapMode?: boolean;
  onViolationChanged?: () => void;
  styles: Record<string, any>;
};

export type ViolationStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

export type ViolationItem = {
  id: string;
  driverId?: number;
  tripId?: number | null;
  type?: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  title: string;
  date: string;
  occurredAt?: string;
  latitude?: number | null;
  longitude?: number | null;
  location: string;
  details: string;
  status: ViolationStatus;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  appeals?: ViolationAppealRecord[];
  proofs?: ViolationProofRecord[];
};

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

const formatViolationType = (type?: ViolationItem['type']) => {
  if (type === 'GEOFENCE_BOUNDARY') return 'Geofence Boundary';
  if (type === 'ROUTE_DEVIATION') return 'Route Deviation';
  if (type === 'UNAUTHORIZED_STOP') return 'Unauthorized Stop';
  return 'Route Violation';
};

const formatDateTime = (value?: string) => {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatViolationCardDateParts = (item: Pick<ViolationItem, 'date' | 'occurredAt'>) => {
  const parsed = new Date(item.occurredAt ?? item.date);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      datePart: parsed.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timePart: parsed.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  }

  const [dashDatePart, dashTimePart] = item.date.split(' - ');
  if (dashTimePart) {
    return {
      datePart: dashDatePart.trim(),
      timePart: dashTimePart.trim(),
    };
  }

  const commaMatch = item.date.match(/^(.+?,\s*\d{4}),\s*(.+)$/);
  if (commaMatch) {
    return {
      datePart: commaMatch[1]?.trim() ?? item.date,
      timePart: commaMatch[2]?.trim() ?? '--:--',
    };
  }

  return {
    datePart: item.date,
    timePart: '--:--',
  };
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
  violationItems: violationItemsProp,
  focusViolationRequest = null,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  isLowBatteryMapMode = false,
  onViolationChanged,
  styles,
}: ViolationScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomSystemInset = Math.max(insets.bottom || 0, Platform.OS === 'android' ? 48 : 0);
  const [query, setQuery] = useState('');
  const detailMapRef = useRef<OsmMapViewHandle | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'TAKE_ACTION' | 'RESOLVED'>('ALL');
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const violationItems = violationItemsProp ?? VIOLATION_ITEMS;
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

  const selectedViolation = useMemo(
    () => violationItems.find((item) => item.id === selectedViolationId) ?? null,
    [selectedViolationId, violationItems],
  );

  useEffect(() => {
    if (!focusViolationRequest?.violationId) {
      return;
    }

    const focusedViolation = violationItems.find((item) => item.id === focusViolationRequest.violationId);
    if (!focusedViolation) {
      return;
    }

    setFilter('ALL');
    setQuery('');
    setSelectedReason('');
    setDetails('');
    setSelectedViolationId(focusedViolation.id);
  }, [focusViolationRequest?.requestedAt, focusViolationRequest?.violationId, violationItems]);

  const selectedViolationCoordinate = useMemo(() => {
    if (
      !selectedViolation ||
      typeof selectedViolation.latitude !== 'number' ||
      !Number.isFinite(selectedViolation.latitude) ||
      typeof selectedViolation.longitude !== 'number' ||
      !Number.isFinite(selectedViolation.longitude)
    ) {
      return null;
    }

    return {
      latitude: selectedViolation.latitude,
      longitude: selectedViolation.longitude,
    };
  }, [selectedViolation]);
  const violationMapMarkers = useMemo(
    () =>
      selectedViolationCoordinate
        ? [
            {
              id: 'violation-location',
              coordinate: selectedViolationCoordinate,
              kind: 'avatar' as const,
              color: '#0F766E',
              initials:
                profileName
                  ?.split(/\s+/)
                  .map((part) => part[0] ?? '')
                  .join('')
                  .slice(0, 2) ?? 'DV',
              size: 34,
            },
          ]
        : [],
    [profileName, selectedViolationCoordinate],
  );
  const violationMapPolygons = useMemo(
    () => [
      {
        id: 'violation-geofence',
        coordinates: OBRERO_GEOFENCE,
        strokeColor: 'rgba(20,125,100,0.45)',
        fillColor: 'rgba(20,125,100,0.06)',
        strokeWidth: 1,
      },
    ],
    [],
  );
  const activeAppeal = selectedViolation?.appeals?.find(
    (appeal) => appeal.status === 'SUBMITTED' || appeal.status === 'UNDER_REVIEW',
  ) ?? null;
  const latestAppeal = selectedViolation?.appeals?.[0] ?? null;
  const latestProof = selectedViolation?.proofs?.[0] ?? null;

  const focusViolationMap = useCallback(() => {
    if (!detailMapRef.current || !selectedViolationCoordinate) {
      return;
    }

    detailMapRef.current.animateCamera(
      {
        center: selectedViolationCoordinate,
        zoom: 18,
        pitch: 0,
        heading: 0,
      },
      { duration: 350 },
    );
  }, [selectedViolationCoordinate]);

  useEffect(() => {
    if (!selectedViolationCoordinate) {
      return;
    }

    const timer = setTimeout(() => {
      focusViolationMap();
    }, 50);

    return () => clearTimeout(timer);
  }, [focusViolationMap, selectedViolationCoordinate, selectedViolationId]);

  const openViolationDetails = (item: ViolationItem) => {
    setSelectedViolationId(item.id);
    setSelectedReason('');
    setDetails('');
  };

  const submitAppeal = async () => {
    if (!selectedViolation) {
      return;
    }
    if (!driverDbId) {
      Alert.alert('Appeal unavailable', 'Sign in again before submitting an appeal.');
      return;
    }
    if (activeAppeal) {
      Alert.alert('Appeal already submitted', 'This violation already has an active appeal under review.');
      return;
    }
    if (!selectedReason.trim()) {
      Alert.alert('Reason required', 'Choose an appeal reason before submitting.');
      return;
    }
    if (selectedViolation.id.startsWith('VL-')) {
      Alert.alert('Demo record', 'Only database violation records can receive appeals.');
      return;
    }

    setIsSubmittingAppeal(true);
    const { error } = await submitViolationAppeal({
      violationId: selectedViolation.id,
      driverId: driverDbId,
      reason: selectedReason.trim(),
      details: details.trim(),
    });
    setIsSubmittingAppeal(false);
    if (error) {
      Alert.alert('Appeal Error', error);
      return;
    }

    Alert.alert('Appeal submitted', 'Your appeal has been sent for review.');
    setSelectedReason('');
    setDetails('');
    onViolationChanged?.();
  };

  const uploadProof = async () => {
    if (!selectedViolation) {
      return;
    }
    if (!driverDbId) {
      Alert.alert('Upload unavailable', 'Sign in again before uploading proof.');
      return;
    }
    if (selectedViolation.id.startsWith('VL-')) {
      Alert.alert('Demo record', 'Only database violation records can receive proof uploads.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission required', 'Allow photo library access to upload violation proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    setIsUploadingProof(true);
    const { error } = await uploadViolationProof({
      violationId: selectedViolation.id,
      driverId: driverDbId,
      localUri: asset.uri,
      contentType: asset.mimeType ?? 'image/jpeg',
      ext: asset.fileName?.split('.').pop(),
    });
    setIsUploadingProof(false);
    if (error) {
      Alert.alert('Proof Upload Error', error);
      return;
    }

    Alert.alert('Proof uploaded', 'Your proof has been linked to this violation.');
    onViolationChanged?.();
  };

  if (selectedViolation) {
    const coordinate = selectedViolationCoordinate;
    const mapRegion = coordinate
      ? {
          ...coordinate,
          latitudeDelta: 0.0035,
          longitudeDelta: 0.0035,
        }
      : {
          latitude: 7.0832297,
          longitude: 125.624803,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
    const osmMapStyleUrl = isLowBatteryMapMode ? OSM_VECTOR_DARK_STYLE : OSM_VECTOR_LIGHT_STYLE_URL;
    const osmBackgroundColor = isLowBatteryMapMode ? OSM_MAXIM_DARK_BACKGROUND : OSM_LIGHT_BACKGROUND;

    return (
      <View style={styles.homeScreen}>
        <View style={styles.homeContentArea}>
          <ScrollView
            contentContainerStyle={[
              localStyles.detailScrollContent,
              {
                paddingTop: 16 + (insets.top || 0),
                paddingBottom: 40 + bottomSystemInset,
              },
              isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={localStyles.listHeaderRow}>
              <Pressable
                style={[
                  localStyles.iconGhost,
                  isLowBatteryMapMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                        shadowOpacity: 0,
                        elevation: 0,
                      }
                    : null,
                ]}
                onPress={() => setSelectedViolationId(null)}
              >
                <AppIcon
                  name="chevron-left"
                  size={18}
                  color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#0F172A'}
                />
              </Pressable>
              <View style={localStyles.headerCopy}>
                <Text
                  style={[
                    localStyles.headerTitle,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  Violation Details
                </Text>
              </View>
              <View style={localStyles.headerRightSpacer} />
            </View>

            <View
              style={[
                localStyles.detailHeroCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <View style={localStyles.detailHeroTop}>
                <View style={localStyles.detailHeroCopy}>
                  <Text
                    style={[
                      localStyles.detailEyebrow,
                      isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                  >
                    Violation ID
                  </Text>
                  <Text
                    style={[
                      localStyles.detailTitle,
                      isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                    ]}
                    numberOfLines={2}
                  >
                    {selectedViolation.title}
                  </Text>
                  <Text
                    style={[
                      localStyles.detailId,
                      isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                  >
                    {selectedViolation.id}
                  </Text>
                </View>
                <View style={[localStyles.detailStatusPill, selectedViolation.status === 'RESOLVED' ? localStyles.detailStatusResolved : null]}>
                  <Text style={localStyles.detailStatusText}>{selectedViolation.status.replace('_', ' ')}</Text>
                </View>
              </View>

              <View
                style={[
                  localStyles.driverRow,
                  isLowBatteryMapMode ? { borderTopColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
                ]}
              >
                <Avatar name={profileName} imageUri={profileImageUri} size={42} />
                <View style={localStyles.driverCopy}>
                  <Text
                    style={[
                      localStyles.driverName,
                      isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileName || 'Driver'}
                  </Text>
                  <Text
                    style={[
                      localStyles.driverMeta,
                      isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileDriverCode || 'No tricycle number'} - {profilePlateNumber || 'No plate number'}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={[
                localStyles.detailMapCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <OsmMapView
                ref={(ref: OsmMapViewHandle | null) => {
                  detailMapRef.current = ref;
                }}
                style={localStyles.detailMap}
                initialRegion={mapRegion}
                mapStyleUrl={osmMapStyleUrl}
                backgroundColor={osmBackgroundColor}
                rotateEnabled={false}
                pitchEnabled={false}
                polygons={violationMapPolygons}
                markers={violationMapMarkers}
                onMapReady={focusViolationMap}
              />
              {!coordinate ? (
                <View
                  style={[
                    localStyles.mapMissingOverlay,
                    isLowBatteryMapMode ? { backgroundColor: 'rgba(35,41,51,0.82)' } : null,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.mapMissingText,
                      isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                  >
                    No exact coordinate saved for this violation
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                localStyles.detailInfoCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <DetailRow label="Trip ID" value={selectedViolation.tripId ? `TRIP-${selectedViolation.tripId}` : 'No linked trip'} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Type" value={formatViolationType(selectedViolation.type)} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Priority" value={selectedViolation.priority} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Timestamp" value={formatDateTime(selectedViolation.occurredAt ?? selectedViolation.date)} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Location" value={selectedViolation.location} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Reason" value={selectedViolation.details} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Appeal Status" value={latestAppeal ? latestAppeal.status.replace('_', ' ') : 'No appeal submitted'} isDarkMode={isLowBatteryMapMode} />
              <DetailRow label="Proof Status" value={latestProof ? latestProof.status.replace('_', ' ') : 'No proof uploaded'} isDarkMode={isLowBatteryMapMode} />
            </View>

            <View
              style={[
                localStyles.actionCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <Text
                style={[
                  localStyles.actionTitle,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Submit Appeal
              </Text>
              {activeAppeal ? (
                <Text
                  style={[
                    localStyles.actionNote,
                    isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  An appeal is already active for this violation.
                </Text>
              ) : (
                <>
                  <View style={localStyles.reasonList}>
                    {appealReasons.map((reason) => {
                      const selected = selectedReason === reason;
                      return (
                        <Pressable
                          key={reason}
                          style={[
                            localStyles.reasonItem,
                            isLowBatteryMapMode
                              ? {
                                  backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                                  borderColor: MAXIM_UI_BORDER_DARK,
                                }
                              : null,
                            selected ? localStyles.reasonItemSelected : null,
                          ]}
                          onPress={() => setSelectedReason(reason)}
                        >
                          <View style={[localStyles.reasonDot, selected ? localStyles.reasonDotSelected : null]} />
                          <Text
                            style={[
                              localStyles.reasonText,
                              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                              selected ? localStyles.reasonTextSelected : null,
                              selected && isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                            ]}
                          >
                            {reason}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={details}
                    onChangeText={setDetails}
                    placeholder="Additional notes"
                    placeholderTextColor={isLowBatteryMapMode ? MAXIM_UI_SUBTLE_DARK : '#94A3B8'}
                    multiline
                    style={[
                      localStyles.detailsInput,
                      isLowBatteryMapMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderColor: MAXIM_UI_BORDER_DARK,
                            color: MAXIM_UI_TEXT_DARK,
                          }
                        : null,
                    ]}
                  />
                  <Pressable
                    style={[localStyles.primaryAction, isSubmittingAppeal ? localStyles.actionDisabled : null]}
                    disabled={isSubmittingAppeal}
                    onPress={submitAppeal}
                  >
                    <Text style={localStyles.primaryActionText}>{isSubmittingAppeal ? 'Submitting...' : 'Submit Appeal'}</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View
              style={[
                localStyles.actionCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <Text
                style={[
                  localStyles.actionTitle,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Proof Upload
              </Text>
              <Text
                style={[
                  localStyles.actionNote,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                {latestProof ? `Latest proof: ${latestProof.status.replace('_', ' ')}` : 'Upload an image as supporting proof.'}
              </Text>
              <Pressable
                style={[localStyles.secondaryAction, isUploadingProof ? localStyles.actionDisabled : null]}
                disabled={isUploadingProof}
                onPress={uploadProof}
              >
                <Text style={localStyles.secondaryActionText}>{isUploadingProof ? 'Uploading...' : 'Upload Proof'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <ScrollView
          contentContainerStyle={[
            localStyles.scrollContent,
            {
              paddingTop: 16 + (insets.top || 0),
              paddingBottom: 140 + bottomSystemInset,
            },
            isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.listHeaderRow}>
            <Pressable
              style={[
                localStyles.iconGhost,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                      shadowOpacity: 0,
                      elevation: 0,
                    }
                  : null,
              ]}
              onPress={() => onNavigate?.('home')}
            >
              <AppIcon
                name="chevron-left"
                size={18}
                color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#0F172A'}
              />
            </Pressable>
            <View style={localStyles.headerCopy}>
              <Text
                style={[
                  localStyles.headerTitle,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Violation History
              </Text>
            </View>
            <View style={localStyles.headerRightSpacer} />
          </View>

          <View
            style={[
              localStyles.searchCard,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                    shadowOpacity: 0,
                    elevation: 0,
                  }
                : null,
            ]}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={isLowBatteryMapMode ? MAXIM_UI_SUBTLE_DARK : '#98A3B3'}
              style={[
                localStyles.searchInput,
                isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
              ]}
            />
            <AppIcon
              name="search"
              size={16}
              color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#64748B'}
            />
          </View>

          <View style={localStyles.filterRow}>
            <Pressable
              style={[
                localStyles.filterPill,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
                filter === 'ALL' && localStyles.filterPillActive,
                filter === 'ALL' && isLowBatteryMapMode
                  ? { backgroundColor: 'rgba(87,199,168,0.16)', borderColor: 'rgba(87,199,168,0.32)' }
                  : null,
              ]}
              onPress={() => setFilter('ALL')}
            >
              <Text
                style={[
                  localStyles.filterText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  filter === 'ALL' && localStyles.filterTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            <Pressable
              style={[
                localStyles.filterPill,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
                filter === 'TAKE_ACTION' && localStyles.filterPillActive,
                filter === 'TAKE_ACTION' && isLowBatteryMapMode
                  ? { backgroundColor: 'rgba(87,199,168,0.16)', borderColor: 'rgba(87,199,168,0.32)' }
                  : null,
              ]}
              onPress={() => setFilter('TAKE_ACTION')}
            >
              <Text
                style={[
                  localStyles.filterText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  filter === 'TAKE_ACTION' && localStyles.filterTextActive,
                ]}
              >
                Take Action
              </Text>
            </Pressable>
            <Pressable
              style={[
                localStyles.filterPill,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
                filter === 'RESOLVED' && localStyles.filterPillActive,
                filter === 'RESOLVED' && isLowBatteryMapMode
                  ? { backgroundColor: 'rgba(87,199,168,0.16)', borderColor: 'rgba(87,199,168,0.32)' }
                  : null,
              ]}
              onPress={() => setFilter('RESOLVED')}
            >
              <Text
                style={[
                  localStyles.filterText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  filter === 'RESOLVED' && localStyles.filterTextActive,
                ]}
              >
                Resolved
              </Text>
            </Pressable>
          </View>

          {rows.length === 0 ? (
            <View
              style={[
                localStyles.emptySection,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <Text style={[localStyles.emptyText, isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
                No violations found in this section
              </Text>
            </View>
          ) : null}

          {rows.map((item) => {
            const { datePart, timePart } = formatViolationCardDateParts(item);
            return (
              <Pressable
                key={item.id}
                onPress={() => openViolationDetails(item)}
                style={[
                  localStyles.invoiceCard,
                  isLowBatteryMapMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                        shadowOpacity: 0,
                        elevation: 0,
                      }
                    : null,
                ]}
              >
                <View style={localStyles.violationCardHeader}>
                  <View
                    style={[
                      localStyles.violationIconBadge,
                      isLowBatteryMapMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderColor: MAXIM_UI_BORDER_DARK,
                          }
                        : null,
                    ]}
                  >
                    <AppIcon name="alert-triangle" size={18} color="#EF4444" />
                  </View>
                  <View style={localStyles.violationCardTitleWrap}>
                    <Text
                      style={[
                        localStyles.violationLabel,
                        isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                      ]}
                    >
                      Reason
                    </Text>
                    <Text
                      style={[
                        localStyles.violationReasonText,
                        isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                      ]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <View
                    style={[
                      localStyles.violationChevron,
                      isLowBatteryMapMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderColor: MAXIM_UI_BORDER_DARK,
                          }
                        : null,
                    ]}
                  >
                    <AppIcon
                      name="chevron-right"
                      size={16}
                      color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#94A3B8'}
                    />
                  </View>
                </View>

                <Text
                  style={[
                    localStyles.violationDetailsPreview,
                    isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                  numberOfLines={2}
                >
                  {item.details}
                </Text>

                <View
                  style={[
                    localStyles.violationMetaGrid,
                    isLowBatteryMapMode ? { borderTopColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
                  ]}
                >
                  <View
                    style={[
                      localStyles.violationMetaPill,
                      isLowBatteryMapMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderColor: MAXIM_UI_BORDER_DARK,
                          }
                        : null,
                    ]}
                  >
                    <AppIcon
                      name="calendar"
                      size={12}
                      color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#64748B'}
                    />
                    <Text
                      style={[
                        localStyles.violationMetaText,
                        isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {datePart}
                    </Text>
                  </View>
                  <View
                    style={[
                      localStyles.violationMetaPill,
                      isLowBatteryMapMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderColor: MAXIM_UI_BORDER_DARK,
                          }
                        : null,
                    ]}
                  >
                    <AppIcon
                      name="clock"
                      size={12}
                      color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#64748B'}
                    />
                    <Text
                      style={[
                        localStyles.violationMetaText,
                        isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {timePart}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    localStyles.violationReferenceRow,
                    isLowBatteryMapMode
                      ? {
                          backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                          borderColor: MAXIM_UI_BORDER_DARK,
                        }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.violationReferenceLabel,
                      isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                  >
                    Reference
                  </Text>
                  <Text
                    style={[
                      localStyles.violationReferenceText,
                      isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {item.id}
                  </Text>
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
        isLowBatteryMapMode={isLowBatteryMapMode}
        styles={styles}
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
  isDarkMode = false,
}: {
  label: string;
  value: string;
  isDarkMode?: boolean;
}) {
  return (
    <View
      style={[
        localStyles.detailRow,
        isDarkMode ? { borderBottomColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
      ]}
    >
      <Text
        style={[
          localStyles.detailRowLabel,
          isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          localStyles.detailRowValue,
          isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
        ]}
      >
        {value || '--'}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 140,
    backgroundColor: '#F4F6FA',
  },
  detailScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: '#F4F6FA',
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerRightSpacer: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
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
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  filterText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  filterTextActive: {
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
    textAlign: 'center',
  },
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  invoiceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
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
  violationCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  violationIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  violationCardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  violationChevron: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  violationDetailsPreview: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationMetaGrid: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  violationMetaPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  violationLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  violationReasonText: {
    marginTop: 2,
    fontSize: 17,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  violationMetaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationReferenceRow: {
    marginTop: 10,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  violationReferenceLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  violationReferenceText: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  detailHeroCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  detailHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  detailHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textTransform: 'uppercase',
  },
  detailTitle: {
    marginTop: 3,
    fontSize: 20,
    lineHeight: 24,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  detailId: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  detailStatusPill: {
    borderRadius: 999,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  detailStatusResolved: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  detailStatusText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
    paddingTop: 12,
  },
  driverCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  detailMapCard: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  detailMap: {
    width: '100%',
    height: '100%',
  },
  avatarMapMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMissingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,250,252,0.82)',
    paddingHorizontal: 16,
  },
  mapMissingText: {
    fontSize: 13,
    lineHeight: 17,
    color: '#475569',
    textAlign: 'center',
    fontFamily: 'CircularStdMedium500',
  },
  detailInfoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  detailRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailRowLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  detailRowValue: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  actionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  actionNote: {
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 10,
  },
  reasonList: {
    gap: 8,
    marginBottom: 10,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  reasonItemSelected: {
    borderColor: '#57c7a8',
    backgroundColor: '#ECFDF5',
  },
  reasonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#94A3B8',
    marginRight: 8,
  },
  reasonDotSelected: {
    borderColor: '#57c7a8',
    backgroundColor: '#57c7a8',
  },
  reasonText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  reasonTextSelected: {
    color: '#0F172A',
  },
  detailsInput: {
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    textAlignVertical: 'top',
    fontSize: 13,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 10,
  },
  primaryAction: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 17,
    fontFamily: 'CircularStdMedium500',
  },
  secondaryAction: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#57c7a8',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: '#147D64',
    fontSize: 14,
    lineHeight: 17,
    fontFamily: 'CircularStdMedium500',
  },
  actionDisabled: {
    opacity: 0.55,
  },
});
