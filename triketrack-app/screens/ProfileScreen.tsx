import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { EditProfileModal, SupportModal, TermsOfUseModal } from '../components/modals';
import { InfoRow } from '../components/rows/InfoRow';
import { Avatar } from '../components/ui';

type ProfileScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  profileName: string;
  profileDriverCode: string;
  profileContact: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  onUpdateProfile: (payload: {
    name: string;
    contact: string;
    imageUri: string | null;
  }) => void | Promise<void>;
  styles: Record<string, any>;
};

export function ProfileScreen({
  onLogout,
  onNavigate,
  profileName,
  profileDriverCode,
  profileContact,
  profilePlateNumber,
  profileImageUri,
  onUpdateProfile,
  styles,
}: ProfileScreenProps) {
  const [draftName, setDraftName] = useState(profileName);
  const [draftContact, setDraftContact] = useState(profileContact);
  const [draftImageUri, setDraftImageUri] = useState<string | null>(profileImageUri);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalShowAvatar, setEditModalShowAvatar] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setDraftName(profileName);
    setDraftContact(profileContact);
    setDraftImageUri(profileImageUri);
  }, [profileName, profileContact, profileImageUri]);

  const openEditModal = () => {
    setDraftName(profileName);
    setDraftContact(profileContact);
    setDraftImageUri(profileImageUri);
    setEditModalShowAvatar(false);
    setEditModalVisible(true);
  };

  const saveProfileChanges = async () => {
    try {
      setIsSavingProfile(true);
      await onUpdateProfile({
        name: draftName.trim() || 'Juan Dela Cruz',
        contact: draftContact.trim() || '09276096932',
        imageUri: draftImageUri,
      });
      setEditModalVisible(false);
    } catch (error) {
      Alert.alert('Profile Update Error', error instanceof Error ? error.message : 'Unable to save profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets.length > 0) {
      setDraftImageUri(result.assets[0].uri);
    }
  };

  const changeAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setDraftImageUri(uri);
      try {
        setIsSavingProfile(true);
        await onUpdateProfile({ name: profileName, contact: profileContact, imageUri: uri });
      } catch (error) {
        Alert.alert('Profile Update Error', error instanceof Error ? error.message : 'Unable to update avatar.');
      } finally {
        setIsSavingProfile(false);
      }
    }
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={localStyles.pageTitle}>Profile</Text>

          <View style={localStyles.avatarWrap}>
            <View style={localStyles.avatarContainer}>
              <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatar} />
              <Pressable style={localStyles.avatarEditBadge} onPress={changeAvatar}>
                <Feather name="edit-2" size={16} color="#111827" />
              </Pressable>
            </View>
          </View>
          {isSavingProfile ? <Text style={localStyles.savingText}>Updating profile photo...</Text> : null}

          <View style={localStyles.card}>
            <View style={localStyles.cardHeader}>
              <Text style={localStyles.cardTitle}>Personal info</Text>
            </View>

            <InfoRow
              icon="user"
              label="Name"
              value={profileName}
              onPress={openEditModal}
              showChevron
              styles={localStyles}
            />
            <InfoRow icon="credit-card" label="Driver code" value={profileDriverCode} styles={localStyles} />
            <InfoRow
              icon="phone"
              label="Phone number"
              value={profileContact}
              onPress={openEditModal}
              showChevron
              styles={localStyles}
            />
            <InfoRow icon="tag" label="Plate number" value={profilePlateNumber} styles={localStyles} />
            <InfoRow
              icon="map-pin"
              label="Assigned route"
              value="Route 18-B"
              isLast
              styles={localStyles}
            />
          </View>

          <View style={localStyles.card}>
            <View style={localStyles.cardHeader}>
              <Text style={localStyles.cardTitle}>Account info</Text>
            </View>

            <InfoRow icon="alert-triangle" label="Total violations" value="10" styles={localStyles} />
            <InfoRow icon="calendar" label="TODA membership" value="April 2011" styles={localStyles} />

            <Pressable style={localStyles.linkRow} onPress={() => setTermsModalVisible(true)}>
              <Text style={localStyles.linkText}>Terms of use</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>

            <Pressable style={localStyles.linkRow} onPress={() => setSupportModalVisible(true)}>
              <Text style={localStyles.linkText}>Support</Text>
              <Feather name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          </View>

          <Pressable style={localStyles.logoutButton} onPress={onLogout}>
            <Feather name="log-out" size={16} color="#FFFFFF" />
            <Text style={localStyles.logoutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </View>

      <HomeNavigationCard
        activeTab="profile"
        onNavigate={onNavigate}
        showCenterRoute={false}
        styles={styles}
      />

      <EditProfileModal
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
        onCancel={() => setEditModalVisible(false)}
        onSave={saveProfileChanges}
        pickProfileImage={pickProfileImage}
        showAvatarPicker={editModalShowAvatar}
        draftName={draftName}
        setDraftName={setDraftName}
        draftContact={draftContact}
        setDraftContact={setDraftContact}
        draftImageUri={draftImageUri}
        profileImageUri={profileImageUri}
      />

      <TermsOfUseModal
        visible={termsModalVisible}
        onRequestClose={() => setTermsModalVisible(false)}
        onClose={() => setTermsModalVisible(false)}
      />

      <SupportModal
        visible={supportModalVisible}
        onRequestClose={() => setSupportModalVisible(false)}
        onClose={() => setSupportModalVisible(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 140,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 32,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    marginBottom: 10,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 94,
    height: 94,
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  savingText: {
    marginTop: -2,
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIconWrap: {
    width: 30,
    alignItems: 'center',
    paddingTop: 3,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 17,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  linkRow: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    backgroundColor: '#FAFBFC',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  linkText: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  logoutButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  logoutText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
});
