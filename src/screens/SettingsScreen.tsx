import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  StatusBar,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {getOrCreateDriverId} from '../lib/driver-identity';
import {getSmartcarAuthUrl, getSmartcarStatus} from '../lib/api-client';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({navigation}: Props) {
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleConnected, setVehicleConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(true);

  // Load driver ID and vehicle status
  useEffect(() => {
    let cancelled = false;

    getOrCreateDriverId().then(async id => {
      if (cancelled) return;
      setDriverId(id);

      const connected = await getSmartcarStatus(id);
      if (!cancelled) {
        setVehicleConnected(connected);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnectVehicle = useCallback(async () => {
    if (!driverId) return;
    setConnecting(true);

    try {
      const authUrl = await getSmartcarAuthUrl(driverId);
      if (!authUrl) {
        Alert.alert(
          'Vehicle Connect Unavailable',
          'SmartCar is not configured on the server. Check that SMARTCAR_CLIENT_ID and SMARTCAR_CLIENT_SECRET are set.',
        );
        return;
      }

      // Open SmartCar Connect in the system browser
      const supported = await Linking.canOpenURL(authUrl);
      if (!supported) {
        Alert.alert('Cannot open browser', 'Please open this URL manually: ' + authUrl);
        return;
      }

      await Linking.openURL(authUrl);

      // After returning from browser, re-check status
      // The OAuth callback redirects to eva://smartcar/success which brings
      // the app back to foreground — we re-check on the next focus
    } catch (err) {
      Alert.alert('Error', 'Failed to start vehicle connect. Please try again.');
    } finally {
      setConnecting(false);
    }
  }, [driverId]);

  const handleRefreshStatus = useCallback(async () => {
    if (!driverId) return;
    setChecking(true);
    const connected = await getSmartcarStatus(driverId);
    setVehicleConnected(connected);
    setChecking(false);
  }, [driverId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Vehicle section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VEHICLE</Text>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>SmartCar</Text>
              {checking ? (
                <ActivityIndicator size="small" color="#4a9eff" />
              ) : (
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {backgroundColor: vehicleConnected ? '#4a9e4a' : '#555'},
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      {color: vehicleConnected ? '#4a9e4a' : '#555'},
                    ]}>
                    {vehicleConnected ? 'Connected' : 'Not connected'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.cardDescription}>
              {vehicleConnected
                ? 'Your vehicle is connected. EVA can read your battery level, range, speed, and location.'
                : 'Connect your vehicle to enable real-time battery, range, and charging queries. Supports 40+ brands including Tesla, BMW, Audi, Ford, and more.'}
            </Text>

            <View style={styles.buttonRow}>
              {!vehicleConnected && (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton, connecting && styles.buttonDisabled]}
                  onPress={handleConnectVehicle}
                  disabled={connecting}>
                  {connecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Connect Vehicle</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleRefreshStatus}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* About section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>EVA</Text>
              <Text style={styles.cardValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Driver ID</Text>
              <Text style={styles.cardValueMono} numberOfLines={1}>
                {driverId ? driverId.slice(0, 8) + '...' : '—'}
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {width: 60},
  backText: {color: '#4a9eff', fontSize: 15},
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.5,
  },
  scroll: {flex: 1},
  scrollContent: {padding: 16, gap: 24},
  section: {gap: 8},
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    gap: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {fontSize: 15, color: '#fff', fontWeight: '500'},
  cardValue: {fontSize: 14, color: '#666'},
  cardValueMono: {fontSize: 12, color: '#555', fontFamily: 'monospace'},
  cardDescription: {fontSize: 13, color: '#555', lineHeight: 19},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  statusDot: {width: 7, height: 7, borderRadius: 3.5},
  statusText: {fontSize: 13, fontWeight: '600'},
  buttonRow: {flexDirection: 'row', gap: 10},
  button: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  primaryButton: {backgroundColor: '#4a9eff', flex: 1},
  primaryButtonText: {color: '#fff', fontWeight: '600', fontSize: 14},
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  secondaryButtonText: {color: '#888', fontSize: 14},
  buttonDisabled: {opacity: 0.5},
  divider: {height: 1, backgroundColor: '#1e1e1e'},
});
