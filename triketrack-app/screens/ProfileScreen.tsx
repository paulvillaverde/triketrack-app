import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'qrcode';
import { SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { EditProfileModal, SupportModal, TermsOfUseModal } from '../components/modals';
import { InfoRow } from '../components/rows/InfoRow';
import { AppIcon, Avatar } from '../components/ui';
import { buildPassengerReportUrl, type DriverQrStatus } from '../supabase';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from './homeScreenShared';

type ProfileScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  profileName: string;
  profileDriverCode: string;
  profileContact: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  profileQrId?: number | null;
  profileQrIssuedAt?: string | null;
  profileQrReportPath?: string | null;
  profileQrStatus?: DriverQrStatus | null;
  profileQrError?: string | null;
  isProfileQrLoading?: boolean;
  totalViolationCount?: number;
  onUpdateProfile: (payload: {
    name: string;
    contact: string;
    imageUri: string | null;
  }) => void | Promise<void>;
  isLowBatteryMapMode?: boolean;
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
  profileQrId = null,
  profileQrIssuedAt = null,
  profileQrReportPath = null,
  profileQrStatus = null,
  profileQrError = null,
  isProfileQrLoading = false,
  totalViolationCount = 0,
  onUpdateProfile,
  isLowBatteryMapMode = false,
  styles,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [draftName, setDraftName] = useState(profileName);
  const [draftContact, setDraftContact] = useState(profileContact);
  const [draftImageUri, setDraftImageUri] = useState<string | null>(profileImageUri);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalShowAvatar, setEditModalShowAvatar] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [qrSvgXml, setQrSvgXml] = useState<string | null>(null);
  const [qrRenderError, setQrRenderError] = useState<string | null>(null);
  const passengerReportQrUrl = useMemo(
    () => buildPassengerReportUrl(profileQrReportPath),
    [profileQrReportPath],
  );
  const qrIssuedLabel = useMemo(() => {
    if (!profileQrIssuedAt) {
      return null;
    }

    const parsed = new Date(profileQrIssuedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [profileQrIssuedAt]);

  useEffect(() => {
    setDraftName(profileName);
    setDraftContact(profileContact);
    setDraftImageUri(profileImageUri);
  }, [profileName, profileContact, profileImageUri]);
  const isDarkMode = isLowBatteryMapMode;

  useEffect(() => {
    let active = true;

    if (!passengerReportQrUrl) {
      setQrSvgXml(null);
      setQrRenderError(null);
      return () => {
        active = false;
      };
    }

    QRCode.toString(passengerReportQrUrl, {
      type: 'svg',
      width: 280,
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((svgMarkup: string) => {
        if (!active) {
          return;
        }

        setQrSvgXml(svgMarkup);
        setQrRenderError(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setQrSvgXml(null);
        setQrRenderError('Unable to render the assigned QR code right now.');
      });

    return () => {
      active = false;
    };
  }, [passengerReportQrUrl]);

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
    <View style={[styles.homeScreen, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}>
      <View style={styles.homeContentArea}>
        <ScrollView
          contentContainerStyle={[
            localStyles.scrollContent,
            {
              paddingTop: 10 + (insets.top || 0),
              paddingBottom: 140 + (insets.bottom || 0),
            },
            isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[
              localStyles.pageTitle,
              isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
          >
            Profile
          </Text>

          <View style={localStyles.avatarWrap}>
            <View style={localStyles.avatarContainer}>
              <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatar} />
              <Pressable
                style={[
                  localStyles.avatarEditBadge,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                        shadowOpacity: 0,
                        elevation: 0,
                      }
                    : null,
                ]}
                onPress={changeAvatar}
              >
                <AppIcon name="edit-2" size={16} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'} />
              </Pressable>
            </View>
          </View>
          {isSavingProfile ? (
            <Text
              style={[
                localStyles.savingText,
                isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
            >
              Updating profile photo...
            </Text>
          ) : null}

          <View
            style={[
              localStyles.card,
              isDarkMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                  }
                : null,
            ]}
          >
            <View style={localStyles.cardHeader}>
              <Text
                style={[
                  localStyles.cardTitle,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Personal info
              </Text>
            </View>

            <InfoRow
              icon="user"
              label="Name"
              value={profileName}
              onPress={openEditModal}
              showChevron
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
            <InfoRow
              icon="credit-card"
              label="Driver code"
              value={profileDriverCode}
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
            <InfoRow
              icon="phone"
              label="Phone number"
              value={profileContact}
              onPress={openEditModal}
              showChevron
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
            <InfoRow
              icon="tag"
              label="Plate number"
              value={profilePlateNumber}
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
            <InfoRow
              icon="map-pin"
              label="Assigned route"
              value="Route 18-B"
              isLast
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
          </View>

          <View
            style={[
              localStyles.card,
              isDarkMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                  }
                : null,
            ]}
          >
            <View style={localStyles.cardHeader}>
              <Text
                style={[
                  localStyles.cardTitle,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Account info
              </Text>
            </View>

            <InfoRow
              icon="alert-triangle"
              label="Total violations"
              value={String(totalViolationCount)}
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />
            <InfoRow
              icon="calendar"
              label="TODA membership"
              value="April 2011"
              styles={localStyles}
              isLowBatteryMapMode={isDarkMode}
            />

            <Pressable
              style={[
                localStyles.linkRow,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                    }
                  : null,
              ]}
              onPress={() => setTermsModalVisible(true)}
            >
              <Text
                style={[
                  localStyles.linkText,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Terms of use
              </Text>
              <AppIcon
                name="chevron-right"
                size={16}
                color={isDarkMode ? MAXIM_UI_MUTED_DARK : '#94A3B8'}
              />
            </Pressable>

            <Pressable
              style={[
                localStyles.linkRow,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                    }
                  : null,
              ]}
              onPress={() => setSupportModalVisible(true)}
            >
              <Text
                style={[
                  localStyles.linkText,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Support
              </Text>
              <AppIcon
                name="chevron-right"
                size={16}
                color={isDarkMode ? MAXIM_UI_MUTED_DARK : '#94A3B8'}
              />
            </Pressable>
          </View>

          <View
            style={[
              localStyles.card,
              isDarkMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                  }
                : null,
            ]}
          >
            <View style={localStyles.qrHeader}>
              <View style={localStyles.qrHeaderCopy}>
                <Text style={[localStyles.qrEyebrow, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
                  Driver QR Code
                </Text>
                <Text
                  style={[
                    localStyles.qrTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  Passenger Report QR
                </Text>
              </View>
              {profileQrId ? (
                <View
                  style={[
                    localStyles.qrBadge,
                    isDarkMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
                  ]}
                >
                  <Text style={[localStyles.qrBadgeText, isDarkMode ? { color: '#7CE6C8' } : null]}>
                    QR #{profileQrId}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={[
                localStyles.qrDescription,
                isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
            >
              Passengers can scan this code to open the web reporting form linked to your driver
              account.
            </Text>

            {isProfileQrLoading && !qrSvgXml && !profileQrError ? (
              <View
                style={[
                  localStyles.qrStateCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <ActivityIndicator size="small" color="#147D64" />
                <Text
                  style={[
                    localStyles.qrStateTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  Loading your assigned QR code...
                </Text>
              </View>
            ) : profileQrError ? (
              <View
                style={[
                  localStyles.qrStateCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <View style={localStyles.qrStateIconWrapError}>
                  <AppIcon name="alert-triangle" size={18} color="#B91C1C" active />
                </View>
                <Text
                  style={[
                    localStyles.qrStateTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  Unable to load your QR code
                </Text>
                <Text
                  style={[
                    localStyles.qrStateBody,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  {profileQrError}
                </Text>
              </View>
            ) : qrRenderError ? (
              <View
                style={[
                  localStyles.qrStateCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <View style={localStyles.qrStateIconWrapError}>
                  <AppIcon name="alert-circle" size={18} color="#B91C1C" active />
                </View>
                <Text
                  style={[
                    localStyles.qrStateTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  QR rendering unavailable
                </Text>
                <Text
                  style={[
                    localStyles.qrStateBody,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  {qrRenderError}
                </Text>
              </View>
            ) : !passengerReportQrUrl ? (
              <View
                style={[
                  localStyles.qrStateCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <View
                  style={[
                    localStyles.qrStateIconWrap,
                    isDarkMode ? { backgroundColor: MAXIM_UI_GREEN_SOFT_DARK } : null,
                  ]}
                >
                  <AppIcon name="globe" size={18} color="#147D64" />
                </View>
                <Text
                  style={[
                    localStyles.qrStateTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  No QR assigned yet
                </Text>
                <Text
                  style={[
                    localStyles.qrStateBody,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  Your passenger reporting QR has not been assigned in the admin dashboard yet.
                </Text>
              </View>
            ) : qrSvgXml ? (
              <View style={localStyles.qrPanel}>
                <View
                  style={[
                    localStyles.qrFrame,
                    isDarkMode
                      ? {
                          backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                          borderColor: MAXIM_UI_BORDER_DARK,
                        }
                      : null,
                  ]}
                >
                  <SvgXml xml={qrSvgXml} width={220} height={220} />
                </View>
                <Text
                  style={[
                    localStyles.qrHint,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  Show this screen to passengers for scanning.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  localStyles.qrStateCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <ActivityIndicator size="small" color="#147D64" />
                <Text
                  style={[
                    localStyles.qrStateTitle,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  Preparing your QR code...
                </Text>
              </View>
            )}

            <View
              style={[
                localStyles.qrMetaRow,
                isDarkMode ? { borderTopColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
              ]}
            >
              <Text
                style={[
                  localStyles.qrMetaLabel,
                  isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                Status
              </Text>
              <Text
                style={[
                  localStyles.qrMetaValue,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {profileQrStatus ? profileQrStatus.replace('_', ' ') : 'Not assigned'}
              </Text>
            </View>

            {qrIssuedLabel ? (
              <View
                style={[
                  localStyles.qrMetaRow,
                  isDarkMode ? { borderTopColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
                ]}
              >
                <Text
                  style={[
                    localStyles.qrMetaLabel,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                >
                  Issued
                </Text>
                <Text
                  style={[
                    localStyles.qrMetaValue,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  {qrIssuedLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable style={localStyles.logoutButton} onPress={onLogout}>
            <AppIcon name="log-out" size={16} color="#FFFFFF" />
            <Text style={localStyles.logoutText}>Log out</Text>
          </Pressable>
        </ScrollView>
      </View>

      <HomeNavigationCard
        activeTab="profile"
        onNavigate={onNavigate}
        showCenterRoute={false}
        isLowBatteryMapMode={isDarkMode}
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
        isLowBatteryMapMode={isDarkMode}
      />

      <TermsOfUseModal
        visible={termsModalVisible}
        onRequestClose={() => setTermsModalVisible(false)}
        onClose={() => setTermsModalVisible(false)}
        isLowBatteryMapMode={isDarkMode}
      />

      <SupportModal
        visible={supportModalVisible}
        onRequestClose={() => setSupportModalVisible(false)}
        onClose={() => setSupportModalVisible(false)}
        isLowBatteryMapMode={isDarkMode}
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
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  qrHeaderCopy: {
    flex: 1,
  },
  qrEyebrow: {
    fontSize: 12,
    lineHeight: 14,
    color: '#147D64',
    fontFamily: 'CircularStdMedium500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  qrTitle: {
    marginTop: 4,
    fontSize: 22,
    lineHeight: 26,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  qrBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#E8FBF6',
  },
  qrBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#147D64',
    fontFamily: 'CircularStdMedium500',
  },
  qrDescription: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  qrPanel: {
    marginTop: 18,
    alignItems: 'center',
  },
  qrFrame: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  qrStateCard: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  qrStateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  qrStateIconWrapError: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  qrStateTitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  qrStateBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  qrMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
    paddingTop: 12,
  },
  qrMetaLabel: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  qrMetaValue: {
    fontSize: 13,
    lineHeight: 16,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textTransform: 'capitalize',
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
