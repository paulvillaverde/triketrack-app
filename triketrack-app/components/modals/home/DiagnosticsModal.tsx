import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../../ui';

type DiagnosticsModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  isDriverOnline: boolean;
  firstFixDurationMs: number | null;
  displayAccuracyMeters: number | null;
  locationFreshnessSeconds: number;
  gpsDebugText: string;
};

export function DiagnosticsModal({
  visible,
  onRequestClose,
  isDriverOnline,
  firstFixDurationMs,
  displayAccuracyMeters,
  locationFreshnessSeconds,
  gpsDebugText,
}: DiagnosticsModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Driver status</Text>
              <Text style={styles.subtitle}>
                Review connection and GPS health without crowding the main map view.
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onRequestClose}>
              <AppIcon name="x" size={18} color="#0F172A" />
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.statusPill, isDriverOnline ? styles.statusPillOnline : styles.statusPillOffline]}>
              <AppIcon name={isDriverOnline ? 'radio' : 'moon'} size={14} color={isDriverOnline ? '#147D64' : '#475569'} />
              <Text style={[styles.statusPillText, isDriverOnline ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
                {isDriverOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <StatusMetric
              icon="clock"
              label="Fix time"
              value={firstFixDurationMs !== null ? `${(firstFixDurationMs / 1000).toFixed(1)}s` : 'Waiting'}
            />
            <StatusMetric
              icon="crosshair"
              label="Accuracy"
              value={displayAccuracyMeters !== null ? `${Math.round(displayAccuracyMeters)} m` : 'Unknown'}
            />
            <StatusMetric
              icon="refresh-cw"
              label="Freshness"
              value={locationFreshnessSeconds > 0 ? `${locationFreshnessSeconds}s` : 'Live'}
            />
          </View>

          <View style={styles.debugBox}>
            <AppIcon name="activity" size={16} color="#57C7A8" />
            <Text style={styles.debugText}>{gpsDebugText}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatusMetric({
  icon,
  label,
  value,
}: {
  icon: AppIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <AppIcon name={icon} size={15} color="#57C7A8" />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  subtitle: {
    marginTop: 5,
    maxWidth: 260,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    marginTop: 18,
    flexDirection: 'row',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPillOnline: {
    backgroundColor: '#E8FBF6',
  },
  statusPillOffline: {
    backgroundColor: '#EEF2F6',
  },
  statusPillText: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  statusPillTextOnline: {
    color: '#147D64',
  },
  statusPillTextOffline: {
    color: '#475569',
  },
  metricsGrid: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  debugBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  debugText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
});
