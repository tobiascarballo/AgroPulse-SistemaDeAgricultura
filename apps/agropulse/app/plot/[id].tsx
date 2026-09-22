import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

import { useApp } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';
import { calculatePlotStatus, formatReadingAge } from '../../src/utils/status';
import { Reading, Valve, IrrigationCommand } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function PlotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { plots, stations, latestReadings, valves, role, user, refreshData } = useApp();

  const plot = plots.find((p) => p.id === id);
  const station = stations.find((s) => s.plot_id === id);
  const reading = station ? latestReadings[station.id] : null;
  const plotValves = valves.filter((v) => v.plot_id === id);

  // Estados de telemetría histórica
  const [history, setHistory] = useState<Reading[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);

  // Estados del modal de riego
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedValve, setSelectedValve] = useState<Valve | null>(null);
  const [actionType, setActionType] = useState<'open' | 'close'>('open');
  const [durationMin, setDurationMin] = useState<string>('30');
  const [submittingCommand, setSubmittingCommand] = useState<boolean>(false);

  // Estado del modal de configuración de umbral (RF-11)
  const [thresholdModalVisible, setThresholdModalVisible] = useState<boolean>(false);
  const [newThresholdMin, setNewThresholdMin] = useState<string>('');

  // 1. Cargar histórico para el gráfico de 6h (RF-10)
  useEffect(() => {
    if (!station) return;
    fetchHistoricalReadings(station.id);
  }, [station, reading]);

  const fetchHistoricalReadings = async (stationId: string) => {
    try {
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .eq('station_id', stationId)
        .order('measured_at', { ascending: true })
        .limit(20);

      if (!error && data) {
        setHistory(data as Reading[]);
      }
    } catch (e) {
      console.error('[PlotDetail] Error cargando histórico:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!plot) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Lote no encontrado.</Text>
      </View>
    );
  }

  const evalStatus = calculatePlotStatus(
    reading?.measured_at,
    reading?.moisture_pct,
    plot.threshold_min,
    plot.threshold_max
  );

  // Manejo de comando de riego (RF-14, RF-15, RF-16, OA-1)
  const handleSendCommand = async () => {
    if (!selectedValve || !user) return;

    // Regla de permisos: Asesor no puede comandar (H2)
    if (role === 'advisor') {
      Alert.alert('Acción denegada', 'Tu rol de Asesor es de solo lectura.');
      return;
    }

    const duration = actionType === 'open' ? parseInt(durationMin, 10) : undefined;
    if (actionType === 'open' && (isNaN(duration!) || duration! < 1 || duration! > 120)) {
      Alert.alert('Duración inválida', 'La duración debe estar entre 1 y 120 minutos.');
      return;
    }

    setSubmittingCommand(true);
    const clientRequestId = uuidv4(); // Idempotencia UUID (RNF-08)

    try {
      // Verificar si ya existe un comando pendiente para esta válvula (RF-16)
      const { data: pendingExisting } = await supabase
        .from('irrigation_commands')
        .select('id')
        .eq('valve_id', selectedValve.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendingExisting) {
        Alert.alert(
          'Comando en curso (RF-16)',
          'Ya existe una orden pendiente sobre esta válvula. Esperá a que finalice.'
        );
        setSubmittingCommand(false);
        return;
      }

      // Insertar nuevo comando con client_request_id
      const { error } = await supabase.from('irrigation_commands').insert({
        valve_id: selectedValve.id,
        requested_by: user.id,
        action: actionType,
        duration_min: duration,
        status: 'pending',
        client_request_id: clientRequestId,
      });

      if (error) {
        Alert.alert('Error al emitir comando', error.message);
      } else {
        Alert.alert(
          'Comando emitido',
          `Orden en estado PENDING registrada con éxito. El actuador responderá en segundos.`
        );
        setModalVisible(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error al comunicarse con Supabase.');
    } finally {
      setSubmittingCommand(false);
    }
  };

  // Guardar nuevo umbral de riego (RF-11)
  const handleSaveThreshold = async () => {
    const val = parseFloat(newThresholdMin);
    if (isNaN(val) || val <= 0 || val >= 100) {
      Alert.alert('Valor inválido', 'El umbral debe ser un porcentaje válido entre 1 y 99.');
      return;
    }

    const { error } = await supabase
      .from('plots')
      .update({ threshold_min: val })
      .eq('id', plot.id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Éxito', 'Umbral actualizado correctamente.');
      setThresholdModalVisible(false);
      refreshData();
    }
  };

  // Preparar datos del gráfico
  const chartData = {
    labels: history.slice(-6).map((h) => {
      const d = new Date(h.measured_at);
      return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }),
    datasets: [
      {
        data:
          history.length > 0
            ? history.slice(-6).map((h) => Number(h.moisture_pct))
            : [0, 0, 0, 0, 0, 0],
        color: () => evalStatus.color,
        strokeWidth: 2,
      },
    ],
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Cabecera del Lote */}
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.plotTitle}>{plot.name}</Text>
            <Text style={styles.cropSubtitle}>Cultivo: {plot.crop}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: evalStatus.badgeBg }]}>
            <Text style={[styles.statusText, { color: evalStatus.color }]}>
              {evalStatus.label}
            </Text>
          </View>
        </View>

        {/* Sugerencia Agronómica (RF-22) */}
        {evalStatus.status === 'dry' && (
          <View style={styles.agronomicAlert}>
            <Feather name="info" size={16} color="#DC2626" />
            <Text style={styles.agronomicText}>
              Humedad bajo umbral ({reading?.moisture_pct}% &lt; {plot.threshold_min}%): considerar riego.
            </Text>
          </View>
        )}
      </View>

      {/* Métricas de Telemetría (RF-09) */}
      <View style={styles.telemetryGrid}>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>Humedad Suelo</Text>
          <Text style={[styles.telemetryValue, { color: evalStatus.color }]}>
            {reading ? `${reading.moisture_pct}%` : 'S/D'}
          </Text>
          <Text style={styles.telemetrySub}>
            {formatReadingAge(reading?.measured_at)}
          </Text>
        </View>

        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>Temperatura</Text>
          <Text style={styles.telemetryValue}>
            {reading ? `${reading.temp_c}°C` : '--'}
          </Text>
          <Text style={styles.telemetrySub}>Ambiente</Text>
        </View>

        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>Lluvia</Text>
          <Text style={styles.telemetryValue}>
            {reading ? `${reading.rain_mm} mm` : '0 mm'}
          </Text>
          <Text style={styles.telemetrySub}>Último tick</Text>
        </View>
      </View>

      {/* Configuración de Umbral (RF-11) */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardTitle}>Umbral de Riego Configurable</Text>
            <Text style={styles.cardSub}>
              Humedad mínima permitida: <Text style={styles.boldText}>{plot.threshold_min}%</Text>
            </Text>
          </View>
          {role === 'producer' && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setNewThresholdMin(plot.threshold_min.toString());
                setThresholdModalVisible(true);
              }}
            >
              <Feather name="edit-2" size={14} color="#166534" />
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Gráfico de Humedad Temporal (RF-10) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tendencia de Humedad (Últimas Horas)</Text>
        {loadingHistory ? (
          <ActivityIndicator size="small" color="#166534" style={{ marginVertical: 20 }} />
        ) : history.length >= 2 ? (
          <LineChart
            data={chartData}
            width={screenWidth - 64}
            height={180}
            chartConfig={{
              backgroundColor: '#FFFFFF',
              backgroundGradientFrom: '#FFFFFF',
              backgroundGradientTo: '#FFFFFF',
              decimalPlaces: 1,
              color: (opacity = 1) => `rgba(22, 101, 52, ${opacity})`,
              labelColor: () => '#64748B',
              style: { borderRadius: 12 },
              propsForDots: { r: '4', strokeWidth: '2', stroke: evalStatus.color },
            }}
            bezier={history.length >= 3}
            style={styles.chart}
          />
        ) : (
          <Text style={styles.noDataText}>
            {history.length === 1
              ? `Única lectura registrada: ${history[0].moisture_pct}%. Esperando nuevos ticks para trazar la curva.`
              : 'No hay serie histórica suficiente.'}
          </Text>
        )}
      </View>

      {/* Válvulas y Comandos de Riego (RF-13, RF-14, RF-15) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actuadores y Válvulas del Lote</Text>
        {plotValves.map((v) => (
          <View key={v.id} style={styles.valveRow}>
            <View>
              <Text style={styles.valveName}>{v.name}</Text>
              <View style={styles.valveStatusRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: v.status === 'open' ? '#10B981' : '#94A3B8' },
                  ]}
                />
                <Text style={styles.valveStatusText}>
                  {v.status === 'open' ? 'Válvula ABIERTA' : 'Válvula CERRADA'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.actionButton,
                role === 'advisor' && styles.buttonDisabled,
              ]}
              disabled={role === 'advisor'}
              onPress={() => {
                setSelectedValve(v);
                setActionType(v.status === 'open' ? 'close' : 'open');
                setModalVisible(true);
              }}
            >
              <MaterialCommunityIcons
                name={v.status === 'open' ? 'valve-closed' : 'valve-open'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.actionButtonText}>
                {role === 'advisor'
                  ? 'Solo lectura'
                  : v.status === 'open'
                  ? 'Cerrar'
                  : 'Regar'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Modal de Confirmación de Comando */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar Comando de Riego</Text>
            <Text style={styles.modalSub}>
              Válvula: <Text style={styles.boldText}>{selectedValve?.name}</Text>
            </Text>
            <Text style={styles.modalSub}>
              Acción: <Text style={styles.boldText}>{actionType.toUpperCase()}</Text>
            </Text>

            {actionType === 'open' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duración (minutos, 1-120):</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={durationMin}
                  onChangeText={setDurationMin}
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
                disabled={submittingCommand}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, submittingCommand && styles.buttonDisabled]}
                onPress={handleSendCommand}
                disabled={submittingCommand}
              >
                {submittingCommand ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Enviar Orden</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Edición de Umbral */}
      <Modal visible={thresholdModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurar Umbral Mínimo</Text>
            <Text style={styles.modalSub}>
              Si la humedad cae por debajo de este valor, el semáforo pasará a ROJO (seco).
            </Text>

            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={newThresholdMin}
              onChangeText={setNewThresholdMin}
              placeholder="Ej: 25.0"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setThresholdModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleSaveThreshold}
              >
                <Text style={styles.confirmButtonText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plotTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  cropSubtitle: { fontSize: 14, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusText: { fontSize: 12, fontWeight: '700' },
  agronomicAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  agronomicText: { color: '#DC2626', fontSize: 12, fontWeight: '600', flex: 1 },
  telemetryGrid: { flexDirection: 'row', gap: 10 },
  telemetryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  telemetryLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  telemetryValue: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginVertical: 4 },
  telemetrySub: { fontSize: 11, color: '#94A3B8' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  cardSub: { fontSize: 13, color: '#64748B' },
  boldText: { fontWeight: '700', color: '#0F172A' },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  chart: { marginVertical: 8, borderRadius: 12 },
  noDataText: { color: '#94A3B8', fontSize: 13, marginVertical: 20, textAlign: 'center' },
  valveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  valveName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  valveStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  valveStatusText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#166534',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  modalSub: { fontSize: 13, color: '#475569', marginBottom: 4 },
  inputGroup: { marginTop: 12 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    marginTop: 6,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  cancelButtonText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  confirmButton: {
    backgroundColor: '#166534',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});