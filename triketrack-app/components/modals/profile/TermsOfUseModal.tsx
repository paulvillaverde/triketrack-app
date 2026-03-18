import { Modal, Pressable, Text, View } from 'react-native';
import { profileModalStyles } from './profileModalStyles';

type TermsOfUseModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onClose: () => void;
};

export function TermsOfUseModal({ visible, onRequestClose, onClose }: TermsOfUseModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={profileModalStyles.modalOverlay}>
        <View style={profileModalStyles.infoModalCard}>
          <Text style={profileModalStyles.modalTitle}>Terms of use</Text>
          <Text style={profileModalStyles.infoText}>
            By using TrikeTrack, drivers agree to follow route compliance policies, maintain valid
            documents, and submit accurate trip logs. Repeated violations may result in account
            restrictions based on operator rules.
          </Text>
          <Pressable style={profileModalStyles.modalPrimaryButton} onPress={onClose}>
            <Text style={profileModalStyles.modalPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

