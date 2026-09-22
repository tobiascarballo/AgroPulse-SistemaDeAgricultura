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
import { useApp } from '../../src/context/AppContext';
import { calculatePlotStatus, formatReadingAge } from '../../src/utils/status';
import { Plot } from '../../src/types';

export default function PlotsScreen() {
  const router = useRouter();
  const { plots, stations, latestReadings, isLoading, refreshData } = useApp();

  const renderPlotItem = ({ item }: { item: Plot }) => {
    const station = stations.find((s) => s.plot_id === item.id);
    const reading = station ? latestReadings[station.id] : null;
    const evalStatus = calculatePlotStatus(
      reading?.measured_at,
      reading?.moisture_pct,
      item.threshold_min,
      item.threshold_max
    );

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/plot/${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.plotName}>{item.name}</Text>
            <Text style={styles.cropText}>Cultivo: {item.crop}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: evalStatus.badgeBg }]}>
            <Text style={[styles.statusText, { color: evalStatus.color }]}>
              {evalStatus.label}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Humedad Actual</Text>
            <Text style={[styles.metricValue, { color: evalStatus.color }]}>
              {reading ? `${reading.moisture_pct}%` : 'S/D'}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Antigüedad</Text>
            <Text style={styles.metricSub}>
              {formatReadingAge(reading?.measured_at)}
            </Text>
          </View>

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Umbral Mínimo</Text>
            <Text style={styles.metricSub}>{item.threshold_min}%</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={plots}
        keyExtractor={(item) => item.id}
        renderItem={renderPlotItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshData} colors={['#166534']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay lotes registrados.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  plotName: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  cropText: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  metricItem: { alignItems: 'flex-start' },
  metricLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  metricValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  metricSub: { fontSize: 13, color: '#334155', fontWeight: '600', marginTop: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#64748B', fontSize: 14 },
});