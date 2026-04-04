import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { AppIcon } from '../../ui';
import { profileModalStyles } from './profileModalStyles';
import { Avatar } from '../../ui';

type EditProfileModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  onCancel: () => void;
  onSave: () => void;
  pickProfileImage: () => void | Promise<void>;
  showAvatarPicker?: boolean;
  draftName: string;
  setDraftName: (value: string) => void;
  draftContact: string;
  setDraftContact: (value: string) => void;
  draftImageUri: string | null;
  profileImageUri: string | null;
};

export function EditProfileModal({
  visible,
  onRequestClose,
  onCancel,
  onSave,
  pickProfileImage,
  showAvatarPicker = true,
  draftName,
  setDraftName,
  draftContact,
  setDraftContact,
  draftImageUri,
  profileImageUri,
}: EditProfileModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={profileModalStyles.modalOverlay}>
        <View style={profileModalStyles.modalCard}>
          <Text style={profileModalStyles.modalTitle}>Edit profile</Text>

          {showAvatarPicker ? (
            <View style={profileModalStyles.modalProfilePreviewWrap}>
              <Avatar
                name={draftName || 'User'}
                imageUri={draftImageUri || profileImageUri}
                style={profileModalStyles.modalProfilePreview}
              />
            </View>
          ) : null}

          <Text style={profileModalStyles.modalLabel}>Name</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Enter full name"
            placeholderTextColor="#94A3B8"
            style={profileModalStyles.modalInput}
          />

          <Text style={profileModalStyles.modalLabel}>Contact</Text>
          <TextInput
            value={draftContact}
            onChangeText={setDraftContact}
            placeholder="Enter contact number"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            style={profileModalStyles.modalInput}
          />

          {showAvatarPicker ? (
            <>
              <Text style={profileModalStyles.modalLabel}>Avatar</Text>
              <Pressable style={profileModalStyles.uploadIconButton} onPress={pickProfileImage}>
                <AppIcon name="folder" size={18} color="#57c7a8" />
              </Pressable>
            </>
          ) : null}

          <View style={profileModalStyles.modalActions}>
            <Pressable style={profileModalStyles.modalSecondaryButton} onPress={onCancel}>
              <Text style={profileModalStyles.modalSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={profileModalStyles.modalPrimaryButton} onPress={onSave}>
              <Text style={profileModalStyles.modalPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
