import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { AppIcon } from '../../ui';
import { profileModalStyles } from './profileModalStyles';
import { Avatar } from '../../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../../screens/homeScreenShared';

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
  isLowBatteryMapMode?: boolean;
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
  isLowBatteryMapMode = false,
}: EditProfileModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={profileModalStyles.modalOverlay}>
        <View
          style={[
            profileModalStyles.modalCard,
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
              profileModalStyles.modalTitle,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            Edit profile
          </Text>

          {showAvatarPicker ? (
            <View style={profileModalStyles.modalProfilePreviewWrap}>
              <Avatar
                name={draftName || 'User'}
                imageUri={draftImageUri || profileImageUri}
                style={profileModalStyles.modalProfilePreview}
              />
            </View>
          ) : null}

          <Text
            style={[
              profileModalStyles.modalLabel,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            Name
          </Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Enter full name"
            placeholderTextColor={isLowBatteryMapMode ? MAXIM_UI_SUBTLE_DARK : '#94A3B8'}
            style={[
              profileModalStyles.modalInput,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                    color: MAXIM_UI_TEXT_DARK,
                  }
                : null,
            ]}
          />

          <Text
            style={[
              profileModalStyles.modalLabel,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            Contact
          </Text>
          <TextInput
            value={draftContact}
            onChangeText={setDraftContact}
            placeholder="Enter contact number"
            placeholderTextColor={isLowBatteryMapMode ? MAXIM_UI_SUBTLE_DARK : '#94A3B8'}
            keyboardType="phone-pad"
            style={[
              profileModalStyles.modalInput,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                    color: MAXIM_UI_TEXT_DARK,
                  }
                : null,
            ]}
          />

          {showAvatarPicker ? (
            <>
              <Text
                style={[
                  profileModalStyles.modalLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                Avatar
              </Text>
              <Pressable
                style={[
                  profileModalStyles.uploadIconButton,
                  isLowBatteryMapMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
                onPress={pickProfileImage}
              >
                <AppIcon name="folder" size={18} color="#57c7a8" />
              </Pressable>
            </>
          ) : null}

          <View style={profileModalStyles.modalActions}>
            <Pressable
              style={[
                profileModalStyles.modalSecondaryButton,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
              onPress={onCancel}
            >
              <Text
                style={[
                  profileModalStyles.modalSecondaryText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Cancel
              </Text>
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
