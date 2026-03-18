import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFonts } from '@expo-google-fonts/poppins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  authenticateDriver,
  completeTrip,
  createViolation,
  listTripsWithRoutePoints,
  setDriverLocationOffline,
  setDriverPassword,
  startTrip,
  upsertDriverLocation,
} from './supabase';
import { LoginScreen } from './screens/LoginScreen';
import { GetStartedScreen } from './screens/GetStartedScreen';
import { HomeScreen, type MapTypeOption } from './screens/HomeScreen';
import { TripScreen } from './screens/TripScreen';
import { ViolationScreen } from './screens/ViolationScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CreatePasswordScreen } from './screens/CreatePasswordScreen';
import { EnableLocationModal } from './components/modals';

type Screen =
  | 'getStarted'
  | 'login'
  | 'createPassword'
  | 'home'
  | 'trip'
  | 'violation'
  | 'profile';

type TripHistoryItem = {
  id: string;
  tripDate: string; // YYYY-MM-DD
  duration: string;
  distance: string;
  fare: string;
  violations: string;
  status: 'ONGOING' | 'COMPLETED' | 'FLAGGED';
  compliance: number;
  routePath: Array<{ latitude: number; longitude: number }>;
};

const createDemoTrip = (): TripHistoryItem => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  return {
    id: 'TRIP-9001',
    tripDate: `${yyyy}-${mm}-${dd}`,
    duration: '3 min',
    distance: '0.90 km',
    fare: '\u20B120.00',
    violations: '0',
    status: 'COMPLETED',
    compliance: 100,
    routePath: [
      // Road-snapped path (OSRM) so the polyline follows streets.
      { latitude: 7.078241, longitude: 125.614578 },
      { latitude: 7.078549, longitude: 125.614448 },
      { latitude: 7.078634, longitude: 125.614412 },
      { latitude: 7.078693, longitude: 125.614387 },
      { latitude: 7.078712, longitude: 125.614521 },
      { latitude: 7.078778, longitude: 125.614469 },
      { latitude: 7.078919, longitude: 125.614354 },
      { latitude: 7.079054, longitude: 125.614251 },
      { latitude: 7.079189, longitude: 125.614146 },
      { latitude: 7.079224, longitude: 125.614122 },
      { latitude: 7.079256, longitude: 125.614104 },
      { latitude: 7.079295, longitude: 125.61409 },
      { latitude: 7.079347, longitude: 125.614086 },
      { latitude: 7.079398, longitude: 125.614088 },
      { latitude: 7.079643, longitude: 125.614092 },
      { latitude: 7.079962, longitude: 125.614097 },
      { latitude: 7.080177, longitude: 125.614101 },
      { latitude: 7.08044, longitude: 125.614105 },
      { latitude: 7.080741, longitude: 125.614115 },
      { latitude: 7.081036, longitude: 125.614125 },
      { latitude: 7.08108, longitude: 125.614127 },
      { latitude: 7.081101, longitude: 125.614127 },
      { latitude: 7.081339, longitude: 125.614139 },
      { latitude: 7.081538, longitude: 125.614149 },
      { latitude: 7.08174, longitude: 125.614158 },
      { latitude: 7.082294, longitude: 125.614829 },
      { latitude: 7.082641, longitude: 125.614546 },
      { latitude: 7.083658, longitude: 125.615749 },
      { latitude: 7.084517, longitude: 125.61681 },
      { latitude: 7.084579, longitude: 125.616887 },
    ],
  };
};

const computeTripTotals = (items: TripHistoryItem[]) =>
  items.reduce(
    (acc, item) => {
      const fareNum = Number(item.fare.replace(/[^\d.]/g, '') || 0);
      const distanceNum = Number(item.distance.replace(/[^\d.]/g, '') || 0);
      const durationNum = Number(item.duration.replace(/[^\d]/g, '') || 0);
      const durationMinutes = item.duration.includes('sec') ? durationNum / 60 : durationNum;
      return {
        earnings: acc.earnings + fareNum,
        trips: acc.trips + 1,
        distance: acc.distance + distanceNum,
        minutes: acc.minutes + durationMinutes,
      };
    },
    { earnings: 0, trips: 0, distance: 0, minutes: 0 },
  );

const SCREEN_CONTENT: Record<Screen, { title: string; subtitle: string }> = {
  getStarted: {
    title: '',
    subtitle: '',
  },
  home: {
    title: '',
    subtitle: '',
  },
  trip: {
    title: '',
    subtitle: '',
  },
  violation: {
    title: '',
    subtitle: '',
  },
  profile: {
    title: '',
    subtitle: '',
  },
  login: {
    title: 'Log in',
    subtitle:
      'Enter your driver code and password to securely access\nyour account and manage your services.',
  },
  createPassword: {
    title: 'Create Password',
    subtitle:
      'Enter your driver code first, then create your password\nto activate your account login.',
  },
};

export default function App() {
  const PROFILE_STORAGE_KEY = 'triketrack_profile_v2_';
  const TRIP_HISTORY_STORAGE_KEY = 'triketrack_trip_history_v1';
  const [fontsLoaded] = useFonts({
    CircularStdMedium500: require('./assets/fonts/circular-std-medium-500.ttf'),
    NissanOpti: require('./assets/fonts/NissanOpti.otf'),
  });
  const [screen, setScreen] = useState<Screen>('getStarted');
  const [routeLocationEnabled, setRouteLocationEnabled] = useState(false);
  const [homeTripScreen, setHomeTripScreen] = useState(false);
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [showEnableLocationModal, setShowEnableLocationModal] = useState(false);
  const [mapTypeOption, setMapTypeOption] = useState<MapTypeOption>('default');
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [tripHistory, setTripHistory] = useState<TripHistoryItem[]>([]);
  const [profileName, setProfileName] = useState('Juan Dela Cruz');
  const [profileDriverCode, setProfileDriverCode] = useState('D-001');
  const [profileContact, setProfileContact] = useState('09276096932');
  const [profilePlateNumber, setProfilePlateNumber] = useState('DXA-1001');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [driverDbId, setDriverDbId] = useState<number | null>(null);
  const [activeTripDbId, setActiveTripDbId] = useState<string | null>(null);
  const activeTripStartPromiseRef = useRef<Promise<string | null> | null>(null);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [tripHistoryHydrated, setTripHistoryHydrated] = useState(false);
  const content = useMemo(() => SCREEN_CONTENT[screen], [screen]);
  const liveTrackingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const hasShownTrackingPermissionErrorRef = useRef(false);

  useEffect(() => {
    if (driverDbId === null) {
      setProfileHydrated(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const raw = await AsyncStorage.getItem(`${PROFILE_STORAGE_KEY}${driverDbId}`);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          name?: string;
          driverCode?: string;
          contact?: string;
          plateNumber?: string;
          imageUri?: string | null;
        };

        if (parsed.name) {
          setProfileName(parsed.name);
        }
        if (parsed.driverCode) {
          setProfileDriverCode(parsed.driverCode);
        }
        if (parsed.contact) {
          setProfileContact(parsed.contact);
        }
        if (parsed.plateNumber) {
          setProfilePlateNumber(parsed.plateNumber);
        }
        if (typeof parsed.imageUri !== 'undefined') {
          setProfileImageUri(parsed.imageUri);
        }
      } catch {
        // Keep defaults on corrupted storage payload.
      } finally {
        setProfileHydrated(true);
      }
    };

    void loadProfile();
  }, [driverDbId]);

  useEffect(() => {
    const loadTripHistory = async () => {
      try {
        const raw = await AsyncStorage.getItem(TRIP_HISTORY_STORAGE_KEY);
        if (!raw) {
          const demoOnly = [createDemoTrip()];
          setTripHistory(demoOnly);
          const totals = computeTripTotals(demoOnly);
          setTotalEarnings(totals.earnings);
          setTotalTrips(totals.trips);
          setTotalDistanceKm(totals.distance);
          setTotalMinutes(totals.minutes);
          return;
        }

        const parsed = JSON.parse(raw) as Array<TripHistoryItem & { routePath?: unknown }>;
        if (!Array.isArray(parsed)) {
          return;
        }

        const normalized = parsed.map((item) => {
          const routePath = Array.isArray(item.routePath)
            ? item.routePath.filter(
                (point): point is { latitude: number; longitude: number } =>
                  typeof point === 'object' &&
                  point !== null &&
                  typeof (point as { latitude?: unknown }).latitude === 'number' &&
                  typeof (point as { longitude?: unknown }).longitude === 'number',
              )
            : [];
          return {
            ...item,
            routePath,
          };
        });

        const hydratedList = [
          createDemoTrip(),
          ...normalized.filter((item) => item.id !== 'TRIP-9001'),
        ];
        setTripHistory(hydratedList);

        const parsedTotals = computeTripTotals(hydratedList);
        setTotalEarnings(parsedTotals.earnings);
        setTotalTrips(parsedTotals.trips);
        setTotalDistanceKm(parsedTotals.distance);
        setTotalMinutes(parsedTotals.minutes);
      } catch {
        // Keep defaults on corrupted storage payload.
      } finally {
        setTripHistoryHydrated(true);
      }
    };

    loadTripHistory();
  }, []);

  useEffect(() => {
    if (!profileHydrated) {
      return;
    }

    const payload = JSON.stringify({
      name: profileName,
      driverCode: profileDriverCode,
      contact: profileContact,
      plateNumber: profilePlateNumber,
      imageUri: profileImageUri,
    });

    if (driverDbId === null) {
      return;
    }

    AsyncStorage.setItem(`${PROFILE_STORAGE_KEY}${driverDbId}`, payload).catch(() => {
      // Ignore write failures to avoid blocking UI.
    });
  }, [profileName, profileDriverCode, profileContact, profilePlateNumber, profileImageUri, profileHydrated, driverDbId]);

  useEffect(() => {
    const shouldTrackLiveLocation =
      driverDbId !== null &&
      Boolean(profileDriverCode) &&
      screen !== 'getStarted' &&
      screen !== 'login' &&
      screen !== 'createPassword';

    if (!shouldTrackLiveLocation) {
      liveTrackingSubscriptionRef.current?.remove();
      liveTrackingSubscriptionRef.current = null;
      return;
    }

    let active = true;

    const startLiveTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) {
        return;
      }

      if (status !== 'granted') {
        if (!hasShownTrackingPermissionErrorRef.current) {
          hasShownTrackingPermissionErrorRef.current = true;
          Alert.alert(
            'Location Required',
            'Enable location permission so your driver account appears on the admin dashboard.',
          );
        }
        return;
      }

      liveTrackingSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (location) => {
          if (!active || driverDbId === null) {
            return;
          }

          void upsertDriverLocation({
            driverId: driverDbId,
            driverCode: profileDriverCode,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed ?? null,
            heading: location.coords.heading ?? null,
            accuracy: location.coords.accuracy ?? null,
            recordedAt: location.timestamp ? new Date(location.timestamp).toISOString() : undefined,
          }).then(({ error }) => {
            if (error) {
              console.warn('Live driver tracking sync failed:', error);
            }
          });
        },
      );
    };

    void startLiveTracking();

    return () => {
      active = false;
      liveTrackingSubscriptionRef.current?.remove();
      liveTrackingSubscriptionRef.current = null;
      if (driverDbId !== null) {
        void setDriverLocationOffline(driverDbId);
      }
    };
  }, [driverDbId, profileDriverCode, screen]);

  const handleDriverLogin = async (driverCode: string, password: string) => {
    if (!driverCode || !password) {
      Alert.alert('Missing fields', 'Enter driver code and password.');
      return;
    }

    setIsAuthenticating(true);
    const { driver, error } = await authenticateDriver(driverCode, password);
    setIsAuthenticating(false);

    if (error) {
      Alert.alert('Login Error', error);
      return;
    }

    if (!driver) {
      Alert.alert('Invalid credentials', 'Driver code or password is incorrect.');
      return;
    }

    setProfileName(driver.full_name);
    setProfileDriverCode(driver.driver_id);
    setProfileContact(driver.contact_number);
    setProfilePlateNumber(driver.plate_number);
    setProfileImageUri(driver.avatar_url ?? null);
    setDriverDbId(driver.id);
    setScreen('home');
  };

  const handleCreatePassword = async (driverCode: string, password: string) => {
    setIsSettingPassword(true);
    const { driver, error } = await setDriverPassword(driverCode, password);
    setIsSettingPassword(false);

    if (error) {
      Alert.alert('Create Password Error', error);
      return;
    }

    if (!driver) {
      Alert.alert('Driver not found', 'The driver code was not found in the database.');
      return;
    }

    Alert.alert('Password created', 'Your password has been saved. You can now log in.');
    setScreen('login');
  };

  useEffect(() => {
    if (driverDbId === null) {
      return;
    }

    const loadTripsFromDb = async () => {
      const { trips, error } = await listTripsWithRoutePoints(driverDbId, 250);
      if (error) {
        return;
      }

      const mapped: TripHistoryItem[] = trips.map((t) => {
        const mins = Math.floor((t.duration_seconds ?? 0) / 60);
        const secs = (t.duration_seconds ?? 0) % 60;
        const durationLabel = mins > 0 ? `${mins} min` : `${secs} sec`;
        const idSuffix = String(t.id).split('-')[0]?.toUpperCase() ?? String(t.id);
        return {
          id: `TRIP-${idSuffix}`,
          tripDate: t.trip_date,
          duration: durationLabel,
          distance: `${Number(t.distance_km ?? 0).toFixed(2)} km`,
          fare: `\u20B1${Number(t.fare ?? 0).toFixed(2)}`,
          violations: '0',
          status: t.status === 'ONGOING' ? 'ONGOING' : 'COMPLETED',
          compliance: 100,
          routePath: t.route_points ?? [],
        };
      });

      setTripHistory(mapped);
      const totals = computeTripTotals(mapped);
      setTotalEarnings(totals.earnings);
      setTotalTrips(totals.trips);
      setTotalDistanceKm(totals.distance);
      setTotalMinutes(totals.minutes);
    };

    void loadTripsFromDb();
  }, [driverDbId]);

  useEffect(() => {
    if (!tripHistoryHydrated) {
      return;
    }

    AsyncStorage.setItem(TRIP_HISTORY_STORAGE_KEY, JSON.stringify(tripHistory)).catch(() => {
      // Ignore write failures to avoid blocking UI.
    });
  }, [tripHistory, tripHistoryHydrated]);

  const handleMainTabNavigate = async (tab: 'home' | 'route' | 'trip' | 'violation' | 'profile') => {
    if (tab === 'home') {
      setScreen('home');
      return;
    }
    if (tab === 'route') {
      if (!routeLocationEnabled) {
        setShowEnableLocationModal(true);
        return;
      }

      setIsDriverOnline(true);
      setHomeTripScreen(true);
      setScreen('home');
      return;
    }
    if (tab === 'trip') {
      setScreen('trip');
      return;
    }
    if (tab === 'violation') {
      setScreen('violation');
      return;
    }
    if (tab === 'profile') {
      setScreen('profile');
    }
  };

  const ensureLocationEnabled = async () => {
    try {
      let permissionStatus = (await Location.getForegroundPermissionsAsync()).status;
      if (permissionStatus !== 'granted') {
        permissionStatus = (await Location.requestForegroundPermissionsAsync()).status;
      }

      if (permissionStatus !== 'granted') {
        Alert.alert('Location Needed', 'Location permission is required to continue.');
        setRouteLocationEnabled(false);
        return false;
      }

      let servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!servicesEnabled && Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // User may dismiss the system dialog.
        }
        servicesEnabled = await Location.hasServicesEnabledAsync();
      }

      if (!servicesEnabled) {
        Alert.alert(
          'Turn On Location',
          'Please enable device location services, then tap Go Online again.',
        );
        setRouteLocationEnabled(false);
        return false;
      }

      setRouteLocationEnabled(true);
      return true;
    } catch {
      Alert.alert('Location Error', 'Unable to enable location right now. Please try again.');
      setRouteLocationEnabled(false);
      return false;
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.grow}
        >
        {screen === 'home' ? (
          <HomeScreen
            onLogout={() => {
              setDriverDbId(null);
              setActiveTripDbId(null);
              activeTripStartPromiseRef.current = null;
              setScreen('login');
            }}
            onNavigate={handleMainTabNavigate}
            totalEarnings={totalEarnings}
            totalTrips={totalTrips}
            totalDistanceKm={totalDistanceKm}
            totalMinutes={totalMinutes}
            isTripScreen={homeTripScreen}
            onGoOnline={() => {
              setIsDriverOnline(true);
            }}
            onGoOffline={() => {
              setHomeTripScreen(false);
              setIsDriverOnline(false);
              // Hide location sharing UI when offline and prompt again next time they go online.
              setRouteLocationEnabled(false);
            }}
            onBackToHome={() => setHomeTripScreen(false)}
            isDriverOnline={isDriverOnline}
            locationEnabled={routeLocationEnabled}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            mapTypeOption={mapTypeOption}
            onChangeMapTypeOption={setMapTypeOption}
            onTripStart={({ startLocation }) => {
              if (driverDbId === null) {
                return;
              }

              const p = (async () => {
                const { tripId, error } = await startTrip(
                  driverDbId,
                  startLocation?.latitude,
                  startLocation?.longitude,
                );
                if (error) {
                  Alert.alert('Trip Sync Error', error);
                  return null;
                }
                if (tripId) {
                  setActiveTripDbId(tripId);
                }
                return tripId;
              })();

              activeTripStartPromiseRef.current = p;
            }}
            onGeofenceExit={({ location }) => {
              if (driverDbId === null) {
                return;
              }

              void (async () => {
                const tripId =
                  activeTripDbId ?? (await activeTripStartPromiseRef.current?.catch(() => null)) ?? null;
                const { error } = await createViolation({
                  driverId: driverDbId,
                  tripId,
                  type: 'GEOFENCE_BOUNDARY',
                  priority: 'HIGH',
                  latitude: location?.latitude,
                  longitude: location?.longitude,
                  locationLabel: 'Obrero geofence',
                  details: 'Driver exited the authorized geofence during an active trip.',
                });
                if (error) {
                  // Keep UI flow unchanged; log via alert only if needed later.
                }
              })();
            }}
            onTripComplete={(payload) => {
              const { fare, distanceKm, durationSeconds, endLocation } = payload;
              const routePath = Array.isArray((payload as { routePath?: unknown }).routePath)
                ? ((payload as { routePath?: Array<{ latitude: number; longitude: number }> }).routePath ?? [])
                : [];
              setTotalEarnings((prev) => prev + fare);
              setTotalTrips((prev) => prev + 1);
              setTotalDistanceKm((prev) => prev + distanceKm);
              setTotalMinutes((prev) => prev + durationSeconds / 60);
              const mins = Math.floor(durationSeconds / 60);
              const secs = durationSeconds % 60;
              const durationLabel = mins > 0 ? `${mins} min` : `${secs} sec`;
              const today = new Date();
              const yyyy = today.getFullYear();
              const mm = String(today.getMonth() + 1).padStart(2, '0');
              const dd = String(today.getDate()).padStart(2, '0');
              const tripDate = `${yyyy}-${mm}-${dd}`;
              setTripHistory((prev) => [
                {
                  id: `TRIP-${String(1000 + prev.length + 1).padStart(4, '0')}`,
                  tripDate,
                  duration: durationLabel,
                  distance: `${distanceKm.toFixed(2)} km`,
                  fare: `\u20B1${fare.toFixed(2)}`,
                  violations: '0',
                  status: 'COMPLETED',
                  compliance: 100,
                  routePath,
                },
                ...prev,
              ]);

              if (driverDbId === null) {
                return;
              }

              void (async () => {
                const startLocation =
                  routePath.length > 0 ? { latitude: routePath[0].latitude, longitude: routePath[0].longitude } : null;
                const resolvedTripId =
                  activeTripDbId ?? (await activeTripStartPromiseRef.current?.catch(() => null)) ?? null;
                const tripId =
                  resolvedTripId ??
                  (await (async () => {
                    const { tripId, error } = await startTrip(
                      driverDbId,
                      startLocation?.latitude,
                      startLocation?.longitude,
                    );
                    if (error) {
                      Alert.alert('Trip Sync Error', error);
                      return null;
                    }
                    return tripId;
                  })());

                if (!tripId) {
                  return;
                }

                const endLat = endLocation?.latitude ?? startLocation?.latitude;
                const endLng = endLocation?.longitude ?? startLocation?.longitude;
                if (typeof endLat !== 'number' || typeof endLng !== 'number') {
                  return;
                }

                const { error } = await completeTrip({
                  tripId,
                  endLat,
                  endLng,
                  distanceKm,
                  fare,
                  durationSeconds,
                  routePoints: routePath,
                });

                if (error) {
                  Alert.alert('Trip Sync Error', error);
                }

                setActiveTripDbId(null);
                activeTripStartPromiseRef.current = null;

                const refreshed = await listTripsWithRoutePoints(driverDbId, 250);
                if (!refreshed.error) {
                  const mapped: TripHistoryItem[] = refreshed.trips.map((t) => {
                    const mins = Math.floor((t.duration_seconds ?? 0) / 60);
                    const secs = (t.duration_seconds ?? 0) % 60;
                    const durationLabel = mins > 0 ? `${mins} min` : `${secs} sec`;
                    const idSuffix = String(t.id).split('-')[0]?.toUpperCase() ?? String(t.id);
                    return {
                      id: `TRIP-${idSuffix}`,
                      tripDate: t.trip_date,
                      duration: durationLabel,
                      distance: `${Number(t.distance_km ?? 0).toFixed(2)} km`,
                      fare: `\u20B1${Number(t.fare ?? 0).toFixed(2)}`,
                      violations: '0',
                      status: t.status === 'ONGOING' ? 'ONGOING' : 'COMPLETED',
                      compliance: 100,
                      routePath: t.route_points ?? [],
                    };
                  });
                  setTripHistory(mapped);
                  const totals = computeTripTotals(mapped);
                  setTotalEarnings(totals.earnings);
                  setTotalTrips(totals.trips);
                  setTotalDistanceKm(totals.distance);
                  setTotalMinutes(totals.minutes);
                }
              })();
            }}
            styles={styles}
          />
        ) : screen === 'trip' ? (
          <TripScreen
            onLogout={() => {
              setDriverDbId(null);
              setActiveTripDbId(null);
              activeTripStartPromiseRef.current = null;
              setScreen('login');
            }}
            onNavigate={handleMainTabNavigate}
            tripHistory={tripHistory}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            activeTab="trip"
            styles={styles}
          />
        ) : screen === 'violation' ? (
          <ViolationScreen
            onLogout={() => {
              setDriverDbId(null);
              setActiveTripDbId(null);
              activeTripStartPromiseRef.current = null;
              setScreen('login');
            }}
            onNavigate={handleMainTabNavigate}
            driverDbId={driverDbId}
            styles={styles}
          />
        ) : screen === 'profile' ? (
        <ProfileScreen
            onLogout={() => {
              setDriverDbId(null);
              setActiveTripDbId(null);
              activeTripStartPromiseRef.current = null;
              setScreen('login');
            }}
            onNavigate={handleMainTabNavigate}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profileContact={profileContact}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            onUpdateProfile={({ name, contact, imageUri }) => {
              setProfileName(name);
              setProfileContact(contact);
              setProfileImageUri(imageUri);
            }}
            styles={styles}
          />
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContainer,
              screen === 'getStarted' && styles.scrollContainerNoTop,
            ]}
            bounces={false}
          >
              {screen === 'getStarted' ? (
                <GetStartedScreen onGetStarted={() => setScreen('login')} styles={styles} />
              ) : (
                <View
                  style={[
                    styles.fullScreenCard,
                    screen === 'login' && styles.loginScreenLowered,
                    screen === 'createPassword' && styles.forgotScreenLowered,
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      setScreen(screen === 'login' ? 'getStarted' : 'login')
                    }
                  style={[
                    styles.backButton,
                  ]}
                >
                  <Feather name="chevron-left" size={20} color="#030318" />
                </Pressable>

                <Text
                  style={[
                    styles.title,
                    (screen === 'login' || screen === 'createPassword') &&
                      styles.loginTitleOffset,
                    (screen === 'login' ||
                      screen === 'createPassword') &&
                      styles.authTitleSmall,
                  ]}
                >
                  {content.title}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                  ]}
                >
                  {content.subtitle}
                </Text>

              {screen === 'login' ? (
                <View style={styles.loginScreenFill}>
                  <LoginScreen
                    onCreatePassword={() => setScreen('createPassword')}
                    onLogin={handleDriverLogin}
                    isAuthenticating={isAuthenticating}
                    styles={styles}
                  />
                </View>
                ) : null}

                {screen === 'createPassword' ? (
                  <CreatePasswordScreen
                    onBackToLogin={() => setScreen('login')}
                    onSubmit={handleCreatePassword}
                    isSubmitting={isSettingPassword}
                    styles={styles}
                  />
                ) : null}
              </View>
            )}
          </ScrollView>
        )}

        <EnableLocationModal
          visible={showEnableLocationModal}
          onRequestClose={() => setShowEnableLocationModal(false)}
          onGrantPermission={async () => {
            const enabled = await ensureLocationEnabled();
            setShowEnableLocationModal(false);
            if (enabled) {
              setIsDriverOnline(true);
              setHomeTripScreen(true);
              setScreen('home');
            }
          }}
          onMaybeLater={() => setShowEnableLocationModal(false)}
        />
      </KeyboardAvoidingView>

        <StatusBar style="dark" translucent backgroundColor="transparent" />
      </View>
    </SafeAreaProvider>
  );
}

const STATUS_BAR_HEIGHT = RNStatusBar.currentHeight ?? 0;
const ACTION_BUTTON_HEIGHT = 52;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EDEFF2',
  },
  grow: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F5F6F8',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  scrollContainerNoTop: {
    paddingTop: 0,
  },
  fullScreenCard: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#F5F6F8',
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  authScreenLowered: {
    marginTop: 150,
  },
  loginScreenLowered: {
    marginTop: 50,
  },
  forgotScreenLowered: {
    marginTop: 50,
  },
  homeScreen: {
    flex: 1,
    backgroundColor: '#F3F5F7',
    paddingTop: Platform.OS === 'android' ? STATUS_BAR_HEIGHT : 0,
  },
  homeContentArea: {
    flex: 1,
  },
  homeDashboardScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 14,
  },
  homeProfileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  homeProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  homeProfileAvatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DCE5EC',
    overflow: 'hidden',
  },
  homeProfileAvatar: {
    width: '100%',
    height: '100%',
  },
  homeProfileTextWrap: {
    flex: 1,
  },
  homeProfileName: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeProfileSub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  homeProfileNotif: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F2FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  homeProfileNotifDot: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  homeEarningsCard: {
    backgroundColor: '#E8FAF1',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#C6EEDB',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeEarningsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeEarningsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeEarningsTitleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  homeEarningsPesoTiny: {
    color: '#047857',
    fontSize: 12,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsLabel: {
    fontSize: 13,
    lineHeight: 16,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  homeEarningsStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
    marginRight: 5,
  },
  homeEarningsStatusText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsValueWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  homeEarningsValue: {
    marginTop: 0,
    fontSize: 32,
    lineHeight: 38,
    color: '#065F46',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsSubText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#4B5563',
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeEarningsTrend: {
    fontSize: 12,
    lineHeight: 15,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsButton: {
    marginTop: 12,
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  homeEarningsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeSectionTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 12,
  },
  homePerformanceBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  homePerformanceBoardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  homePerformanceBoardTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceBoardSub: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  homePerformanceItem: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 122,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  homePerformanceItemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homePerformanceTripsCard: {
    backgroundColor: '#ECF9F3',
    borderColor: '#D0F0E2',
  },
  homePerformanceViolationsCard: {
    backgroundColor: '#FFF2F2',
    borderColor: '#FFDADA',
  },
  homePerformanceEarningsCard: {
    backgroundColor: '#FFF8E8',
    borderColor: '#FFE7B3',
  },
  homePerformanceRatingsCard: {
    backgroundColor: '#F4EEFF',
    borderColor: '#E7DAFF',
  },
  homePerformanceIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homePerformancePesoIcon: {
    fontSize: 11,
    lineHeight: 12,
    color: '#A16207',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceLabel: {
    fontSize: 15,
    lineHeight: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceValue: {
    marginTop: 14,
    fontSize: 30,
    lineHeight: 32,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeViolationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeViolationsTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  homeViolationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 5,
    marginRight: 10,
  },
  homeViolationDotRed: {
    backgroundColor: '#FF1E1E',
  },
  homeViolationDotGreen: {
    backgroundColor: '#18E43F',
  },
  homeViolationTextWrap: {
    flex: 1,
  },
  homeViolationMainText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationSubText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertItem: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  homeViolationAlertDanger: {
    backgroundColor: '#FFF4F4',
    borderColor: '#FFD6D6',
  },
  homeViolationAlertWarn: {
    backgroundColor: '#FFF9EE',
    borderColor: '#FFE3B5',
  },
  homeViolationAlertInfo: {
    backgroundColor: '#F6F8FF',
    borderColor: '#DDE4FF',
  },
  homeViolationAlertSuccess: {
    backgroundColor: '#F3FFF7',
    borderColor: '#CDEFD9',
  },
  homeViolationAlertTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  homeViolationAlertTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  homeViolationBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  homeViolationBadgeDanger: {
    backgroundColor: '#FF4D4D',
  },
  homeViolationBadgeWarn: {
    backgroundColor: '#E7A400',
  },
  homeViolationBadgeInfo: {
    backgroundColor: '#5B7BFF',
  },
  homeViolationBadgeSuccess: {
    backgroundColor: '#57c7a8',
  },
  homeViolationAlertTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationTag: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  homeViolationTagText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertDesc: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#374151',
    fontFamily: 'CircularStdMedium500',
  },
  homeTripListSection: {
    marginTop: 14,
  },
  homeViolationsCardPro: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
  },
  homeCardHeadLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 10,
  },
  homeCardHeadIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  homeViolationsProHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeViolationsProTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProTitleWrap: {
    flex: 1,
  },
  homeViolationsProSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProBadge: {
    borderRadius: 999,
    backgroundColor: '#EAF8F1',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  homeViolationsProBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  homeViolationsProStatItem: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 3,
  },
  homeViolationsProStatValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProStatLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProList: {
    marginTop: 2,
  },
  homeViolationsProItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3F6',
  },
  homeViolationsProMarker: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },
  homeViolationsProMarkerDanger: {
    backgroundColor: '#EF4444',
  },
  homeViolationsProMarkerWarn: {
    backgroundColor: '#F59E0B',
  },
  homeViolationsProMarkerSuccess: {
    backgroundColor: '#57c7a8',
  },
  homeViolationsProTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  homeViolationsProItemTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProItemMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProItemTag: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
  },
  homeRecentTripsLedgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  homeRecentTripsLedgerTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    marginBottom: 2,
  },
  homeRecentTripsLedgerHeadText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3F6',
  },
  homeRecentTripsLedgerRowLast: {
    borderBottomWidth: 0,
  },
  homeRecentTripsLedgerLeft: {
    flex: 1,
    marginRight: 8,
  },
  homeRecentTripsLedgerRoute: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerRight: {
    alignItems: 'flex-end',
  },
  homeRecentTripsLedgerFare: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerStatus: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    padding: 12,
  },
  homeRecentTripsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeRecentTripsTitle: {
    fontSize: 19,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF2F5',
  },
  homeRecentTripRowLast: {
    borderBottomWidth: 0,
  },
  homeRecentTripLeft: {
    flex: 1,
    marginRight: 8,
  },
  homeRecentTripRoute: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripRight: {
    alignItems: 'flex-end',
  },
  homeRecentTripFare: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 4,
  },
  homeRecentTripStatusPill: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  homeRecentTripStatusText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripItem: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF2F5',
  },
  homeRecentTripItemLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  homeScroll: {
    paddingHorizontal: 16,
    paddingBottom: 160,
    paddingTop: 8,
  },
  homeHeaderSticky: {
    backgroundColor: '#F3F5F7',
    marginBottom: 8,
    zIndex: 10,
  },
  homeHeaderCard: {
    backgroundColor: '#57c7a8',
    borderRadius: 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    minHeight: 98,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'hidden',
  },
  homeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  homeAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  homeAvatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  homeAvatarStatus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#57c7a8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  homeHeaderText: {
    marginLeft: 10,
  },
  homeHeaderIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  homeWelcomeText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeName: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
    fontFamily: 'CircularStdMedium500',
  },
  homeHeaderSubText: {
    color: '#FFFFFF',
    opacity: 0.95,
    fontSize: 15,
    lineHeight: 18,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeDriver: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeHeaderAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeHeaderBottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeLicenseLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeLicenseValue: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
  },
  homeAvailabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeAvailabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CFE0D8',
    marginRight: 6,
  },
  homeAvailabilityText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  homeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  homeCardTitle: {
    fontSize: 18,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 14,
  },
  homeOnlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  homeOnlineText: {
    fontSize: 18,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  homeOnlineSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 3,
  },
  homeOnlineSwitchDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  homeRadarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  homeRadarOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarMid: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarCore: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeTripTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeTripTopLabel: {
    fontSize: 12,
    color: '#68737E',
    fontFamily: 'CircularStdMedium500',
  },
  homeTripTopValue: {
    fontSize: 14,
    color: '#111827',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripTimePill: {
    backgroundColor: '#EAF8F1',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  homeTripTimeText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  homeStatBox: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  homeStatTrips: {
    backgroundColor: '#ECF8F2',
  },
  homeStatEarnings: {
    backgroundColor: '#FFF5E9',
  },
  homeStatRating: {
    backgroundColor: '#F5EEFF',
  },
  homeStatViolations: {
    backgroundColor: '#FFF0F0',
  },
  homeStatValue: {
    fontSize: 13,
    fontFamily: 'CircularStdMedium500',
    marginTop: 6,
    color: '#030318',
  },
  homeStatLabel: {
    fontSize: 10,
    color: '#667085',
    fontFamily: 'CircularStdMedium500',
    marginTop: 2,
  },
  homeMapMock: {
    borderRadius: 14,
    height: 170,
    backgroundColor: '#F4F6F7',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    marginBottom: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMapView: {
    width: '100%',
    height: '100%',
  },
  homeMapOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(241,245,242,0.85)',
  },
  homeMapStatusText: {
    color: '#3A4A42',
    fontSize: 12,
    fontFamily: 'CircularStdMedium500',
  },
  homeMapIndicatorOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(59,183,126,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#57c7a8',
  },
  homeMapIndicatorInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
  },
  homeMapFallbackPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -9,
    marginTop: -9,
  },
  homeMapFallbackEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAF1EC',
  },
  homeTripMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  homeTripMeta: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DFE5E2',
    paddingVertical: 10,
    alignItems: 'center',
  },
  homeTripMetaValue: {
    color: '#030318',
    fontSize: 14,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripMetaLabel: {
    color: '#7A838C',
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripButton: {
    backgroundColor: '#57c7a8',
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  homeTripButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'CircularStdMedium500',
  },
  homeBottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'android' ? 0 : 0,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 10 : 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    zIndex: 100,
    elevation: 0,
    overflow: 'visible',
  },
  homeBottomSlot: {
    width: '20%',
    alignItems: 'center',
  },
  homeBottomSlotNoCenter: {
    width: '25%',
    alignItems: 'center',
  },
  homeBottomItem: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  homeBottomCenterSlot: {
    width: '20%',
    alignItems: 'center',
    position: 'relative',
    minHeight: 46,
    justifyContent: 'flex-end',
  },
  homeCenterRouteButton: {
    position: 'absolute',
    top: -24,
    left: '50%',
    transform: [{ translateX: -36 }],
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#57c7a8',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  homeBottomActiveLine: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    marginBottom: 6,
  },
  homeBottomActiveLineVisible: {
    backgroundColor: '#57c7a8',
  },
  homeBottomItemActive: {
    alignItems: 'center',
    gap: 4,
  },
  homeBottomText: {
    fontSize: 12,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  homeBottomTextActive: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  violationTitle: {
    fontSize: 34,
    lineHeight: 36,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginTop: 2,
  },
  violationOpenBadge: {
    backgroundColor: '#EAF8F1',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  violationOpenBadgeText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  violationSummaryBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  violationSummaryValue: {
    fontSize: 16,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryLabel: {
    fontSize: 11,
    color: '#6D7480',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanHeader: {
    fontSize: 34,
    lineHeight: 38,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSubHeader: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 15,
    lineHeight: 20,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSummary: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationCleanSummaryItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  violationCleanSummaryValue: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSummaryLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSectionTitle: {
    marginBottom: 8,
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  violationCleanMarker: {
    width: 6,
  },
  violationCleanMarkerOpen: {
    backgroundColor: '#E34A4A',
  },
  violationCleanMarkerReview: {
    backgroundColor: '#E0B400',
  },
  violationCleanMarkerResolved: {
    backgroundColor: '#57c7a8',
  },
  violationCleanMain: {
    flex: 1,
    padding: 14,
  },
  violationCleanTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  violationCleanTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanId: {
    fontSize: 12,
    lineHeight: 14,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationCleanMetaText: {
    marginLeft: 6,
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanDetails: {
    marginTop: 3,
    marginBottom: 9,
    fontSize: 14,
    lineHeight: 19,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationCleanPriority: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  violationCleanPriorityHigh: {
    backgroundColor: '#FEE2E2',
  },
  violationCleanPriorityMedium: {
    backgroundColor: '#FEF3C7',
  },
  violationCleanPriorityLow: {
    backgroundColor: '#DCFCE7',
  },
  violationCleanPriorityText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanAction: {
    minWidth: 104,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CDEFD9',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationCleanActionText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSummaryRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationSimpleSummaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  violationSimpleSummaryValue: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSummaryLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSection: {
    marginBottom: 14,
  },
  violationSimpleSectionTitle: {
    marginBottom: 10,
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  violationSimpleCardResolved: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    marginBottom: 10,
  },
  violationSimpleAccent: {
    width: 6,
  },
  violationSimpleAccentHigh: {
    backgroundColor: '#E34A4A',
  },
  violationSimpleAccentMedium: {
    backgroundColor: '#E0B400',
  },
  violationSimpleCardBody: {
    flex: 1,
    padding: 12,
  },
  violationSimpleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  violationSimpleId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleStatusPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  violationSimpleStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationSimpleStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationSimpleStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationSimpleStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleStatusTextOpen: {
    color: '#B91C1C',
  },
  violationSimpleStatusTextReview: {
    color: '#B7791F',
  },
  violationSimpleStatusTextResolved: {
    color: '#15803D',
  },
  violationSimpleCardTitle: {
    fontSize: 17,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 7,
  },
  violationSimpleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationSimpleMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleDetails: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleActionBtn: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 10,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  violationSimpleActionText: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  violationAltTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltFilterBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationAltStatsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationAltStatPill: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF0',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  violationAltStatValue: {
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltStatLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltTimeline: {
    paddingBottom: 4,
  },
  violationAltTimelineRow: {
    flexDirection: 'row',
  },
  violationAltRailWrap: {
    width: 22,
    alignItems: 'center',
  },
  violationAltRailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  violationAltRailDotHigh: {
    backgroundColor: '#E34A4A',
  },
  violationAltRailDotMedium: {
    backgroundColor: '#E0B400',
  },
  violationAltRailDotLow: {
    backgroundColor: '#3CCB71',
  },
  violationAltRailLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: '#DDE5EC',
  },
  violationAltCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  violationAltCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  violationAltId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltTime: {
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltCardTitle: {
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltRoute: {
    marginTop: 2,
    marginBottom: 7,
    fontSize: 12,
    lineHeight: 14,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationAltMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltDetails: {
    marginTop: 4,
    marginBottom: 9,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationAltStatusChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  violationAltStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationAltStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationAltStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationAltStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationAltStatusTextOpen: {
    color: '#B91C1C',
  },
  violationAltStatusTextReview: {
    color: '#B7791F',
  },
  violationAltStatusTextResolved: {
    color: '#15803D',
  },
  violationAltActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CDEFD9',
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  violationAltActionText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationCenterTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationCenterSub: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  violationHealthTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  violationHealthLabel: {
    fontSize: 12,
    lineHeight: 14,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthValue: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 22,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  violationHealthBadgeText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#D1FAE5',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  violationHealthBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#E34A4A',
  },
  violationHealthStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  violationHealthStat: {
    flex: 1,
    alignItems: 'center',
  },
  violationHealthStatValue: {
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthStatLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  violationFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  violationFilterChipActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#EAF8F1',
  },
  violationFilterText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationFilterTextActive: {
    color: '#047857',
  },
  violationTicketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 14,
    marginBottom: 12,
  },
  violationTicketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  violationTicketIdWrap: {
    flex: 1,
    marginRight: 10,
  },
  violationTicketId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketRoute: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketStatus: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  violationTicketStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationTicketStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationTicketStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationTicketStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketStatusTextOpen: {
    color: '#B91C1C',
  },
  violationTicketStatusTextReview: {
    color: '#B7791F',
  },
  violationTicketStatusTextResolved: {
    color: '#15803D',
  },
  violationTicketTitle: {
    fontSize: 17,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  violationTicketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  violationTicketMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketDetails: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationSeverityPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  violationSeverityHigh: {
    backgroundColor: '#FEE2E2',
  },
  violationSeverityMedium: {
    backgroundColor: '#FEF3C7',
  },
  violationSeverityLow: {
    backgroundColor: '#DCFCE7',
  },
  violationSeverityText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketAction: {
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#CDEFD9',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  violationTicketActionText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  violationHeroTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  violationHeroSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#FFE1E1',
  },
  violationHeroBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#B91C1C',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryRowNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  violationSummaryBoxNew: {
    flex: 1,
    alignItems: 'center',
  },
  violationSummaryValueNew: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryLabelNew: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5EBF1',
  },
  violationCardAccent: {
    width: 6,
  },
  violationCardBody: {
    flex: 1,
    padding: 15,
  },
  violationCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  violationIdPill: {
    borderRadius: 999,
    backgroundColor: '#F3F7FB',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8EF',
  },
  violationIdText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  violationStatusPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  violationStatusOpen: {
    backgroundColor: '#FFF3F3',
  },
  violationStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationStatusTextOpen: {
    color: '#B91C1C',
  },
  violationStatusTextReview: {
    color: '#B7791F',
  },
  violationStatusTextResolved: {
    color: '#15803D',
  },
  violationCardTitleNew: {
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardType: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  violationInfoText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  violationDetailsNew: {
    marginTop: 6,
    marginBottom: 11,
    fontSize: 13,
    lineHeight: 18,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionButtonNew: {
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationActionOpen: {
    backgroundColor: '#E03A3A',
  },
  violationActionReview: {
    backgroundColor: '#F3CF61',
  },
  violationActionResolvedNew: {
    backgroundColor: '#BDE27A',
  },
  violationActionTextNew: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionTextDarkNew: {
    color: '#1F2937',
  },
  violationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  violationTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F2',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 8,
  },
  violationTypeText: {
    fontSize: 11,
    color: '#3A4A42',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardTitle: {
    fontSize: 20,
    lineHeight: 23,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  violationMuted: {
    fontSize: 13,
    lineHeight: 17,
    color: '#4A535D',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 4,
  },
  violationDetails: {
    fontSize: 14,
    lineHeight: 19,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
    marginTop: 8,
    marginBottom: 12,
  },
  violationActionButton: {
    borderRadius: 8,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationActionDanger: {
    backgroundColor: '#E03A3A',
  },
  violationActionWarning: {
    backgroundColor: '#F3CF61',
  },
  violationActionResolved: {
    backgroundColor: '#BDE27A',
  },
  violationActionTextLight: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionTextDark: {
    fontSize: 14,
    lineHeight: 16,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tripTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripEtaPill: {
    backgroundColor: '#EAF8F1',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tripEtaText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  tripMapCard: {
    height: 190,
    borderRadius: 16,
    backgroundColor: '#F4F6F7',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  tripMapText: {
    fontSize: 14,
    color: '#3A4A42',
    marginTop: 8,
    fontFamily: 'CircularStdMedium500',
  },
  tripMapSubText: {
    fontSize: 12,
    color: '#7A838C',
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
  },
  tripStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tripStatPill: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DFE5E2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 10,
  },
  tripStatValue: {
    fontSize: 14,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripStatLabel: {
    fontSize: 11,
    color: '#6D7480',
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tripSectionTitle: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripAvatarStub: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripPassengerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  tripPassengerName: {
    fontSize: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerSub: {
    fontSize: 12,
    color: '#6D7480',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  tripCallButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripActionRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  tripActionButton: {
    flex: 1,
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripActionSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E6E3',
    marginRight: 8,
  },
  tripActionSecondaryText: {
    fontSize: 14,
    color: '#46515B',
    fontFamily: 'CircularStdMedium500',
  },
  tripActionPrimary: {
    backgroundColor: '#57c7a8',
    marginLeft: 8,
  },
  tripActionPrimaryText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  tripFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE3E0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  tripFilterChipActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#EAF8F1',
  },
  tripFilterText: {
    fontSize: 12,
    color: '#68737E',
    fontFamily: 'CircularStdMedium500',
  },
  tripFilterTextActive: {
    color: '#57c7a8',
  },
  tripLogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tripLogTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tripLogId: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tripLogStatusCompleted: {
    backgroundColor: '#EAF8F1',
  },
  tripLogStatusCancelled: {
    backgroundColor: '#FFF1F1',
  },
  tripLogStatusText: {
    fontSize: 11,
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusCompletedText: {
    color: '#57c7a8',
  },
  tripLogStatusCancelledText: {
    color: '#D94444',
  },
  tripLogRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripLogRoute: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogDate: {
    fontSize: 12,
    color: '#6D7480',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripLogBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripLogMeta: {
    fontSize: 12,
    color: '#6D7480',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogFare: {
    fontSize: 14,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  tripListTitle: {
    fontSize: 32,
    lineHeight: 35,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 0,
  },
  tripScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 10,
  },
  tripHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  tripHeroTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  tripHeroSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#EBF8F1',
    borderWidth: 1,
    borderColor: '#D0EEDD',
  },
  tripHeroBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripTopFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripTopFilterChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  tripTopFilterChipActive: {
    backgroundColor: '#030318',
  },
  tripTopFilterText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'CircularStdMedium500',
  },
  tripTopFilterTextActive: {
    color: '#FFFFFF',
  },
  tripSearchBar: {
    height: 46,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  tripSearchText: {
    fontSize: 12,
    color: '#7B848D',
    marginLeft: 8,
    fontFamily: 'CircularStdMedium500',
  },
  tripOfflineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  tripOfflineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F7B93A',
    marginRight: 6,
  },
  tripOfflineText: {
    fontSize: 12,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  tripSummaryStrip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingVertical: 11,
    paddingHorizontal: 8,
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripSummaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripSummaryValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripSummaryLabel: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogCardNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5EBF1',
  },
  tripLogLeftAccent: {
    width: 6,
  },
  tripLogContent: {
    flex: 1,
    padding: 15,
  },
  tripLogMetaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  tripLogIdPill: {
    borderRadius: 999,
    backgroundColor: '#EEF7F1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#D7ECDD',
  },
  tripLogIdPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogDateText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tripLogRouteTitle: {
    fontSize: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    flex: 1,
    marginRight: 8,
  },
  tripLogStatusBadge: {
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tripLogStatusBadgeOngoing: {
    backgroundColor: '#FFF8D8',
  },
  tripLogStatusBadgeCompleted: {
    backgroundColor: '#EAF8F1',
  },
  tripLogStatusBadgeFlagged: {
    backgroundColor: '#FFF1F1',
  },
  tripLogStatusBadgeText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusTextOngoing: {
    color: '#D6A308',
  },
  tripLogStatusTextCompleted: {
    color: '#27A866',
  },
  tripLogStatusTextFlagged: {
    color: '#D94444',
  },
  tripLogMuted: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripMetricPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tripMetricPill: {
    width: '32%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EEF4',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tripMetricPillLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripMetricPillValue: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  tripLogStatsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  tripLogStatBlock: {
    marginRight: 24,
  },
  tripLogStatValue: {
    fontSize: 21,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatMeta: {
    fontSize: 15,
    color: '#111827',
    marginRight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceText: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceValue: {
    fontSize: 11,
    lineHeight: 13,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tripComplianceFill: {
    height: '100%',
    borderRadius: 999,
  },
  routeScreenContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  routeMapBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EEF2F1',
    transform: [{ scale: 1.2 }],
  },
  routeMapLine: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D9DEDE',
  },
  routeMapLineA: {
    width: '90%',
    top: '20%',
    left: '-5%',
    transform: [{ rotate: '-18deg' }],
  },
  routeMapLineB: {
    width: '95%',
    top: '42%',
    left: '4%',
    transform: [{ rotate: '12deg' }],
  },
  routeMapLineC: {
    width: '85%',
    top: '62%',
    left: '-8%',
    transform: [{ rotate: '-8deg' }],
  },
  routeMapLineD: {
    width: '78%',
    top: '82%',
    left: '18%',
    transform: [{ rotate: '16deg' }],
  },
  routeMapCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(217,222,222,0.45)',
  },
  routeMapCircleA: {
    top: '30%',
    right: -30,
  },
  routeMapCircleB: {
    bottom: '22%',
    left: -20,
  },
  routeScreenBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 150,
  },
  routePinWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  routeTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    marginBottom: 8,
  },
  routeSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    marginBottom: 22,
  },
  routeEnableButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 110,
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  routeEnableButtonText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  routeMapScreen: {
    flex: 1,
  },
  routeBackButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? STATUS_BAR_HEIGHT + 12 : 52,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E5ECF3',
    zIndex: 10,
  },
  routeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  routePersonMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#11B377',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeTargetMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeTripPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF1',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  routeGeofenceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  routeGeofenceStatusLabel: {
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  routeGeofencePill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  routeGeofencePillInside: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  routeGeofencePillOutside: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  routeGeofencePillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  routeGeofencePillTextInside: {
    color: '#047857',
  },
  routeGeofencePillTextOutside: {
    color: '#B91C1C',
  },
  routeTripStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  routeTripStatPill: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE8EF',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F7FAFD',
  },
  routeTripStatValue: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  routeTripStatLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  routeFareList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  routeFareOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E1E9',
    backgroundColor: '#F6FAFC',
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  routeFareOptionActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#ECFDF5',
  },
  routeFareOptionText: {
    fontSize: 13,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  routeFareOptionTextActive: {
    color: '#047857',
  },
  routeStartTripButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStartTripText: {
    fontSize: 18,
    lineHeight: 21,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  profileScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 10,
  },
  profileIdentityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profileName: {
    fontSize: 24,
    lineHeight: 28,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSub: {
    marginTop: 4,
    fontSize: 20,
    lineHeight: 22,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  profileDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  profileDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F4',
  },
  profileDetailLabel: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileDetailValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profilePageTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 12,
  },
  profileSettingsUserCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileSettingsUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileSettingsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 10,
  },
  profileSettingsUserTextWrap: {
    flex: 1,
  },
  profileSettingsName: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsSub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSettingsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    marginBottom: 12,
  },
  profileSettingsSectionTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  profileSettingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  profileSettingsActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  profileSettingsRowLast: {
    borderBottomWidth: 0,
  },
  profileSettingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  profileSettingsRowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  profileSettingsRowLabel: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsRowValue: {
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsActionTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsActionSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  profileLogoutButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 4,
    gap: 8,
  },
  profileLogoutButtonText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  backButton: {
    width: 45,
    height: 45,
    borderRadius: 18,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  backButtonCreateAccount: {
    marginBottom: 20,
    marginTop: -38
  },
  title: {
    textAlign: 'center',
    fontSize: 52,
    lineHeight: 56,
    fontFamily: 'CircularStdMedium500',
    color: '#111827',
    marginBottom: 8,
  },
  authTitleSmall: {
    fontSize: 44,
    lineHeight: 48,
  },
  loginTitleOffset: {
    marginTop: 20,
  },
  createAccountTitle: {
    marginTop: 8,
    marginBottom:0,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    color: '#6D7480',
    marginBottom: 20,
    fontFamily: 'CircularStdMedium500',
  },
  createAccountSubtitle: {
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputWrapper: {
    height: 62,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  inputIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    marginLeft: 8,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
    textAlignVertical: 'center',
  },
  trailingIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
    marginBottom: 16,
  },
  forgotPasswordRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  smallMuted: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  smallLinkDark: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  primaryButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 6,
  },
  loginPrimaryButtonLower: {
    marginTop: 8,
  },
  loginFormContainer: {
    flex: 1,
  },
  loginScreenFill: {
    flex: 1,
  },
  loginButtonBottomSpacer: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
  rowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  createAccountRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  helperText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  createAccountContent: {
    marginTop: 0,
    marginBottom: 0,
  },
  createAccountLowered: {
    marginTop: 0,
  },
  createAccountFooterGap: {
    height:8,
  },
  greenLink: {
    fontSize: 14,
    color: '#26B97B',
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#DADDE2',
    marginTop: 18,
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 14,
  },
  socialBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonGapTop: {
    marginTop: 12,
  },
  getStartedContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  getStartedHero: {
    position: 'absolute',
    top: 100,
    right: 0,
    bottom: 0,
    left: 40,
    backgroundColor: 'white',
  },
  getStartedCard: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    maxWidth: '100%',
  },
  getStartedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 32,
    textAlign: 'center',
    fontFamily: 'CircularStdMedium500',
  },
  getStartedSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'CircularStdMedium500',
  },
  getStartedDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  getStartedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FAFAFA',
    opacity: 0.6,
  },
  getStartedDotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C0EC4E',
    opacity: 1,
  },
  getStartedButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 100,
    backgroundColor: '#C0EC4E',
    alignSelf: 'center',
    width: '95%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 35,
  },
  getStartedButtonWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  getStartedButtonText: {
    color: '#030318',
    fontSize: 18,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
    fontWeight: '600',
  },
  getStartedButtonIcon: {
    position: 'absolute',
    right: 8,
    width: 60,
    height: 60,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedTopCopy: {
    position: 'absolute',
    top: 75,
    left: 24,
    right: 24,
    zIndex: 2,
  },
  getStartedBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 40,
    lineHeight: 30,
    fontFamily: 'CircularStdMedium500',
    fontWeight: '700',
    marginBottom: 32,
  },
  getStartedBrandText: {
    fontSize: 36,
    lineHeight: 36,
    fontFamily: 'NissanOpti',
    color: '#030318',
    marginBottom: 32,
    letterSpacing: 1,
    fontWeight: 'normal',
  },
  getStartedBrandAccent: {
    color: '#C0EC4E',
    fontFamily: 'NissanOpti',
    fontWeight: 'normal',
  },
  getStartedBrandMain: {
    color: '#030318',
    fontFamily: 'NissanOpti',
    fontWeight: 'normal',
  },
  getStartedHeadline: {
    color: '#030318',
    fontSize: 26,
    lineHeight: 33,
    fontFamily: 'NissanOpti',
    marginTop: 45,
    textAlign: 'left',
    fontWeight: 'normal',
    letterSpacing: 1,
  },
});
