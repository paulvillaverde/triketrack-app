import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../ui';

type TripSummaryModalProps = {
  visible: boolean;
  durationText: string;
  distanceText: string;
  speedText: string;
  statusText: string;
  onClose: () => void;
};

export function TripSummaryModal({
  visible,
  durationText,
  distanceText,
  speedText,
  statusText,
  onClose,
}: TripSummaryModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <AppIcon name="check-circle" size={28} color="#147D64" active />
          </View>
          <Text style={styles.title}>Trip ended</Text>
          <Text style={styles.subtitle}>
            Your live route has been saved. Here’s a quick summary of the trip you just completed.
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{durationText}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{distanceText}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{speedText}</Text>
              <Text style={styles.statLabel}>Avg speed</Text>
            </View>
          </View>

          <View style={styles.statusPill}>
            <AppIcon name="navigation" size={14} color="#147D64" active />
            <Text style={styles.statusPillText}>{statusText}</Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Done</Text>
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
  statsRow: {
    marginTop: 20,
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
  statusPillText: {
    color: '#147D64',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  primaryButton: {
    marginTop: 22,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
});
