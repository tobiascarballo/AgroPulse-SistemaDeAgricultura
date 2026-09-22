import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { useApp } from '../src/context/AppContext';

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('AgroPulse2026!');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (userEmail?: string) => {
    const targetEmail = (userEmail || email).trim();
    if (!targetEmail || !password) {
      Alert.alert('Datos requeridos', 'Ingresá tu correo y contraseña.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error de inicio de sesión', 'Email o contraseña incorrectos.');
    } else {
      router.replace('/(tabs)');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#166534" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logoTitle}>AgroPulse 🌱</Text>
          <Text style={styles.subtitle}>Agricultura de Precisión y Telemetría</Text>
          <Text style={styles.badge}>Estancia Didáctica Concordia</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="usuario@agropulse.test"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={() => handleLogin()}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>Acceso rápido para la defensa</Text>
            <View style={styles.line} />
          </View>

          <View style={styles.roleButtons}>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => {
                setEmail('productor@agropulse.test');
                handleLogin('productor@agropulse.test');
              }}
            >
              <Text style={styles.quickButtonText}>👨‍🌾 Productor (Control Total)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => {
                setEmail('operador@agropulse.test');
                handleLogin('operador@agropulse.test');
              }}
            >
              <Text style={styles.quickButtonText}>⚙️ Operador (Válvulas)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => {
                setEmail('asesor@agropulse.test');
                handleLogin('asesor@agropulse.test');
              }}
            >
              <Text style={styles.quickButtonText}>🔍 Asesor (Solo Lectura)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoTitle: { fontSize: 32, fontWeight: '800', color: '#166534', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: '#64748B', marginTop: 4 },
  badge: {
    marginTop: 8,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  primaryButton: {
    backgroundColor: '#166534',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 8, fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  roleButtons: { gap: 10 },
  quickButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickButtonText: { fontSize: 13, color: '#334155', fontWeight: '600' },
});