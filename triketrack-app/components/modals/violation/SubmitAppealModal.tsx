import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { violationModalStyles } from './violationModalStyles';

type SubmitAppealModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  selectedViolation: { title: string; id: string } | null;
  appealReasons: string[];
  selectedReason: string;
  setSelectedReason: (value: string) => void;
  details: string;
  setDetails: (value: string) => void;
  onSubmit?: () => Promise<{ error: string | null } | void> | ({ error: string | null } | void);
  onClose: () => void;
};

export function SubmitAppealModal({
  visible,
  onRequestClose,
  selectedViolation,
  appealReasons,
  selectedReason,
  setSelectedReason,
  details,
  setDetails,
  onSubmit,
  onClose,
}: SubmitAppealModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={violationModalStyles.modalBackdrop}>
        <View style={violationModalStyles.modalCard}>
          <View style={violationModalStyles.modalHeadRow}>
            <View style={violationModalStyles.modalTitleWrap}>
              <View style={violationModalStyles.modalTitleIcon}>
                <Feather name="edit-3" size={14} color="#FFFFFF" />
              </View>
              <View>
                <Text style={violationModalStyles.modalTitle}>Submit Appeal</Text>
                <Text style={violationModalStyles.modalSub}>
                  {selectedViolation
                    ? `${selectedViolation.title} (${selectedViolation.id})`
                    : 'Violation appeal'}
                </Text>
              </View>
            </View>
            <Pressable style={violationModalStyles.modalCloseBtn} onPress={onClose}>
              <Feather name="x" size={16} color="#475569" />
            </Pressable>
          </View>

          <View style={violationModalStyles.modalViolationInfo}>
            <Feather name="alert-circle" size={14} color="#B45309" />
            <Text style={violationModalStyles.modalViolationInfoText}>
              Choose one reason and submit your appeal for review.
            </Text>
          </View>

          <Text style={violationModalStyles.modalSectionTitle}>Reason</Text>
          <View style={violationModalStyles.reasonList}>
            {appealReasons.map((reason) => {
              const selected = selectedReason === reason;
              return (
                <Pressable
                  key={reason}
                  style={[
                    violationModalStyles.reasonItem,
                    selected && violationModalStyles.reasonItemSelected,
                  ]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <View
                    style={[
                      violationModalStyles.reasonDot,
                      selected && violationModalStyles.reasonDotSelected,
                    ]}
                  />
                  <Text
                    style={[
                      violationModalStyles.reasonText,
                      selected && violationModalStyles.reasonTextSelected,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={violationModalStyles.modalSectionTitle}>Detailed Explanation (Optional)</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add more details about what happened..."
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            style={violationModalStyles.detailsInput}
          />

          <View style={violationModalStyles.modalActions}>
            <Pressable style={violationModalStyles.modalCancelBtn} onPress={onClose}>
              <Text style={violationModalStyles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={violationModalStyles.modalSubmitBtn}
              onPress={async () => {
                if (!selectedReason) {
                  Alert.alert('Reason Required', 'Please select at least one reason for your appeal.');
                  return;
                }
                if (onSubmit) {
                  const res = await onSubmit();
                  const err = res && typeof res === 'object' && 'error' in res ? res.error : null;
                  if (err) {
                    Alert.alert('Appeal Error', err);
                    return;
                  }
                }
                onClose();
                Alert.alert('Appeal Submitted', 'Your appeal has been sent for review.');
              }}
            >
              <Text style={violationModalStyles.modalSubmitText}>Submit Appeal</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
