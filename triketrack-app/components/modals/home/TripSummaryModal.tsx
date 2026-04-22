import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

type TripSummaryModalProps = {
  visible: boolean;
  tripNumberText?: string | null;
  durationText: string;
  distanceText: string;
  speedText: string;
  statusText: string;
  pickupText?: string | null;
  destinationText?: string | null;
  fareText?: string | null;
  busy?: boolean;
  onClose: () => void;
  isLowBatteryMapMode?: boolean;
};

export function TripSummaryModal({
  visible,
  tripNumberText,
  durationText,
  distanceText,
  speedText,
  statusText,
  pickupText,
  destinationText,
  fareText,
  busy = false,
  onClose,
  isLowBatteryMapMode = false,
}: TripSummaryModalProps) {
  const resolvedPickupText = pickupText?.trim() || (busy ? 'Resolving pickup point...' : 'Unknown pickup point');
  const resolvedDestinationText =
    destinationText?.trim() || (busy ? 'Resolving destination...' : 'Unknown destination');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_DARK,
                  shadowOpacity: 0,
                  elevation: 0,
                }
              : null,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <AppIcon name="check-circle" size={28} color="#147D64" active />
            )}
          </View>
          <Text
            style={[
              styles.title,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            {busy ? 'Ending trip' : 'Trip ended'}
          </Text>
          <Text
            style={[
              styles.subtitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            {busy
              ? 'We are finalizing your route, saving the trip, and trying to improve the road match.'
              : 'Your live route has been saved. Here is a quick summary of the trip you just completed.'}
          </Text>

          {tripNumberText ? (
            <View
              style={[
                styles.tripNumberPill,
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
                  styles.tripNumberLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                Trip ID
              </Text>
              <Text
                style={[
                  styles.tripNumberValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {tripNumberText}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.receiptCard,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                  }
                : null,
            ]}
          >
            <View style={styles.receiptEndpointRow}>
              <View style={[styles.endpointIcon, styles.pickupIcon]}>
                <AppIcon name="map-pin" size={12} color="#147D64" active />
              </View>
              <View style={styles.receiptEndpointCopy}>
                <Text
                  style={[
                    styles.receiptLabel,
                    isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Pickup point
                </Text>
                <Text
                  style={[
                    styles.receiptValue,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={2}
                >
                  {resolvedPickupText}
                </Text>
              </View>
              <View style={styles.receiptSideMetric}>
                <Text
                  style={[
                    styles.receiptLabel,
                    isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Payment
                </Text>
                <Text
                  style={[
                    styles.receiptMetricValue,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  {fareText ?? '--'}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.receiptConnector,
                isLowBatteryMapMode ? { backgroundColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
              ]}
            />
            <View style={styles.receiptEndpointRow}>
              <View style={[styles.endpointIcon, styles.destinationIcon]}>
                <AppIcon name="map-pin" size={12} color="#B42318" active />
              </View>
              <View style={styles.receiptEndpointCopy}>
                <Text
                  style={[
                    styles.receiptLabel,
                    isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Destination
                </Text>
                <Text
                  style={[
                    styles.receiptValue,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={2}
                >
                  {resolvedDestinationText}
                </Text>
              </View>
              <View style={styles.receiptSideMetric}>
                <Text
                  style={[
                    styles.receiptLabel,
                    isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Distance
                </Text>
                <Text
                  style={[
                    styles.receiptMetricValue,
                    isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  {distanceText}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
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
                  styles.statValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {durationText}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                Duration
              </Text>
            </View>
            <View
              style={[
                styles.statCard,
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
                  styles.statValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {speedText}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                Avg speed
              </Text>
            </View>
          </View>

          <View style={[styles.statusPill, busy ? styles.statusPillBusy : null]}>
            {busy ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <AppIcon name="navigation" size={14} color="#147D64" active />
            )}
            <Text style={[styles.statusPillText, busy ? styles.statusPillTextBusy : null]}>
              {statusText}
            </Text>
          </View>

          <Pressable
            style={[styles.primaryButton, busy ? styles.primaryButtonDisabled : null]}
            onPress={onClose}
            disabled={busy}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Finalizing...' : 'Done'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8FBF6',
    marginBottom: 14,
  },
  title: {
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 26,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNumberPill: {
    marginTop: 16,
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tripNumberLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNumberValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  receiptCard: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  receiptEndpointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  endpointIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pickupIcon: {
    backgroundColor: '#E8FBF6',
  },
  destinationIcon: {
    backgroundColor: '#FEE4E2',
  },
  receiptEndpointCopy: {
    flex: 1,
  },
  receiptLabel: {
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  receiptValue: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  receiptSideMetric: {
    width: 78,
    alignItems: 'flex-end',
  },
  receiptMetricValue: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  receiptConnector: {
    width: 1,
    height: 20,
    marginLeft: 11,
    marginVertical: 4,
    backgroundColor: '#CBD5E1',
  },
  statsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  statusPill: {
    marginTop: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8FBF6',
  },
  statusPillBusy: {
    backgroundColor: '#E8F1FF',
  },
  statusPillText: {
    color: '#147D64',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  statusPillTextBusy: {
    color: '#2563EB',
  },
  primaryButton: {
    marginTop: 22,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
});
