import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, role, organization, latestReadings, signOut } = useApp();

  // Cálculo de diagnóstico del último tick recibido
  const readingsList = Object.values(latestReadings);
  const mostRecentReading = readingsList.sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime()
  )[0];

  const lagSeconds = mostRecentReading
    ? Math.max(0, Math.floor((Date.now() - new Date(mostRecentReading.measured_at).getTime()) / 1000))
    : null;

  const handleLogout = async () => {
    router.replace('/');
    await signOut();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sección Usuario y Rol */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sesión Activa</Text>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{user?.email || 'Desconocido'}</Text>

        <Text style={styles.label}>Rol de Usuario (§05):</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{role ? role.toUpperCase() : 'SIN ROL'}</Text>
        </View>

        <Text style={styles.label}>Establecimiento:</Text>
        <Text style={styles.value}>{organization?.name || 'Ninguno'}</Text>
        <Text style={styles.subValue}>{organization?.region}</Text>
      </View>

      {/* Sección Diagnóstico RF-23 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Diagnóstico de Telemetría (RF-23)</Text>
        <Text style={styles.label}>User UUID:</Text>
        <Text style={styles.mono}>{user?.id}</Text>

        <Text style={styles.label}>Último tick recibido:</Text>
        <Text style={styles.mono}>{mostRecentReading ? mostRecentReading.measured_at : 'Ninguno'}</Text>

        <Text style={styles.label}>Lag aparente (Backend ↔ App):</Text>
        <Text style={[styles.value, { color: (lagSeconds ?? 0) <= 5 ? '#10B981' : '#F59E0B' }]}>
          {lagSeconds !== null ? `${lagSeconds} segundos` : 'Sin datos'}
        </Text>
      </View>

      {/* Botón Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  label: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 8 },
  value: { fontSize: 15, color: '#0F172A', fontWeight: '600', marginTop: 2 },
  subValue: { fontSize: 12, color: '#94A3B8' },
  mono: { fontSize: 11, fontFamily: 'monospace', color: '#334155', backgroundColor: '#F1F5F9', padding: 6, borderRadius: 6, marginTop: 4 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  roleText: { color: '#166534', fontWeight: '700', fontSize: 12 },
  logoutButton: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  logoutText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
});