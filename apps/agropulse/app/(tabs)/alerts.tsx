import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { calculatePlotStatus, formatReadingAge } from '../../src/utils/status';

interface AlertItem {
  id: string;
  plotId: string;
  plotName: string;
  crop: string;
  type: 'dry' | 'stale';
  title: string;
  description: string;
  measuredAt?: string;
  valueText?: string;
  timestamp: string;
}

export default function AlertsScreen() {
  const router = useRouter();
  const { plots, stations, latestReadings, isLoading, refreshData } = useApp();

  // Derivar alertas activas según RF-19 (Seco) y RF-20 (Stale)
  const activeAlerts: AlertItem[] = [];

  plots.forEach((plot) => {
    const station = stations.find((s) => s.plot_id === plot.id);
    const reading = station ? latestReadings[station.id] : null;
    const evalStatus = calculatePlotStatus(
      reading?.measured_at,
      reading?.moisture_pct,
      plot.threshold_min,
      plot.threshold_max
    );

    if (evalStatus.status === 'dry') {
      activeAlerts.push({
        id: `dry-${plot.id}`,
        plotId: plot.id,
        plotName: plot.name,
        crop: plot.crop,
        type: 'dry',
        title: `Humedad Crítica: ${plot.name}`,
        description: `La humedad cayó a ${reading?.moisture_pct ?? 0}% (umbral mínimo: ${plot.threshold_min}%). Se aconseja iniciar riego.`,
        measuredAt: reading?.measured_at,
        valueText: `${reading?.moisture_pct ?? 0}%`,
        timestamp: reading?.measured_at || new Date().toISOString(),
      });
    } else if (evalStatus.status === 'stale') {
      activeAlerts.push({
        id: `stale-${plot.id}`,
        plotId: plot.id,
        plotName: plot.name,
        crop: plot.crop,
        type: 'stale',
        title: `Estación sin reporte: ${plot.name}`,
        description: station
          ? `La estación "${station.name}" no envía telemetría hace más de 15 min.`
          : 'No se encontraron estaciones configuradas para este lote.',
        measuredAt: reading?.measured_at,
        valueText: formatReadingAge(reading?.measured_at),
        timestamp: reading?.measured_at || new Date().toISOString(),
      });
    }
  });

  const renderAlertItem = ({ item }: { item: AlertItem }) => {
    const isDry = item.type === 'dry';

    return (
      <TouchableOpacity
        style={[
          styles.alertCard,
          { borderLeftColor: isDry ? '#EF4444' : '#64748B' },
        ]}
        onPress={() => router.push(`/plot/${item.plotId}` as any)}
      >
        <View style={styles.alertHeader}>
          <View style={styles.iconTitleRow}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: isDry ? '#FEE2E2' : '#F1F5F9' },
              ]}
            >
              {isDry ? (
                <MaterialCommunityIcons
                  name="water-alert-outline"
                  size={22}
                  color="#DC2626"
                />
              ) : (
                <MaterialCommunityIcons
                  name="cloud-off-outline"
                  size={22}
                  color="#475569"
                />
              )}
            </View>
            <View style={styles.headerTexts}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.cropText}>Cultivo: {item.crop}</Text>
            </View>
          </View>
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: isDry ? '#EF4444' : '#64748B' },
            ]}
          >
            <Text style={styles.severityText}>
              {isDry ? 'URGENTE' : 'TELEMETRÍA'}
            </Text>
          </View>
        </View>

        <Text style={styles.alertDescription}>{item.description}</Text>

        <View style={styles.footerRow}>
          <View style={styles.timeRow}>
            <Feather name="clock" size={12} color="#94A3B8" />
            <Text style={styles.timeText}>
              {item.measuredAt
                ? formatReadingAge(item.measuredAt)
                : 'Sin registros recientes'}
            </Text>
          </View>
          <View style={styles.actionPrompt}>
            <Text style={styles.actionPromptText}>Ver Lote</Text>
            <Feather name="chevron-right" size={14} color="#166534" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={activeAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refreshData}
            colors={['#166534']}
          />
        }
        ListHeaderComponent={
          activeAlerts.length > 0 ? (
            <View style={styles.summaryBar}>
              <Text style={styles.summaryText}>
                ⚠️ {activeAlerts.length} alerta{activeAlerts.length > 1 ? 's' : ''} activa{activeAlerts.length > 1 ? 's' : ''} en campo
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="check-circle" size={40} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>Todo bajo control</Text>
            <Text style={styles.emptyText}>
              No hay alertas activas. Todos los lotes se encuentran en niveles de humedad óptimos y reportando telemetría.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { padding: 16, gap: 12 },
  summaryBar: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 4,
  },
  summaryText: { color: '#92400E', fontWeight: '700', fontSize: 13 },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTexts: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cropText: { fontSize: 12, color: '#64748B', marginTop: 1 },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  severityText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  alertDescription: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginVertical: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 4,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, color: '#94A3B8' },
  actionPrompt: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionPromptText: { fontSize: 13, fontWeight: '700', color: '#166534' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});