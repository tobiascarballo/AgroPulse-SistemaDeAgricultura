import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useApp } from '../../src/context/AppContext';
import { calculatePlotStatus } from '../../src/utils/status';
import { Plot } from '../../src/types';

// Fallback compatible tanto con Web como con Native Maps
let MapView: any = View;
let Polygon: any = View;
let Marker: any = View;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Polygon = Maps.Polygon;
    Marker = Maps.Marker;
  } catch (e) {
    console.warn('react-native-maps no disponible en esta plataforma');
  }
}

export default function MapScreen() {
  const router = useRouter();
  const { plots, stations, latestReadings, isLoading, organization } = useApp();
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentPlotName, setCurrentPlotName] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Solicitando GPS...');

  // Coordenadas fijas de referencia didáctica: Concordia, Entre Ríos
  const INITIAL_REGION = {
    latitude: -31.3900,
    longitude: -58.0200,
    latitudeDelta: 0.035,
    longitudeDelta: 0.035,
  };

  // RF-06: Localización GPS del dispositivo
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setGpsStatus('Ubicación no disponible (sin permiso)');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        setGpsStatus('GPS conectado');
        checkIfInsidePlot(coords);
      } catch (err) {
        setGpsStatus('Ubicación no disponible');
      }
    })();
  }, [plots]);

  // Algoritmo Ray-Casting simplificado para verificar si el GPS cae dentro del polígono (RF-06)
  const checkIfInsidePlot = (coords: { latitude: number; longitude: number }) => {
    for (const plot of plots) {
      if (isPointInPolygon(coords, plot.polygon)) {
        setCurrentPlotName(plot.name);
        return;
      }
    }
    setCurrentPlotName(null);
  };

  const isPointInPolygon = (point: { latitude: number; longitude: number }, vs: { latitude: number; longitude: number }[]) => {
    const x = point.longitude, y = point.latitude;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].longitude, yi = vs[i].latitude;
      const xj = vs[j].longitude, yj = vs[j].latitude;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#166534" />
        <Text style={styles.loadingText}>Cargando cartografía de Concordia...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Barra superior de contexto de establecimiento (RF-03) */}
      <View style={styles.topBanner}>
        <View>
          <Text style={styles.orgName}>{organization?.name || 'AgroPulse'}</Text>
          <Text style={styles.gpsInfo}>
            📍 {currentPlotName ? `Estás en: ${currentPlotName}` : gpsStatus}
          </Text>
        </View>
      </View>

      {/* Mapa nativo */}
      {Platform.OS !== 'web' ? (
        <MapView style={styles.map} initialRegion={INITIAL_REGION} showsUserLocation>
          {plots.map((plot) => {
            const station = stations.find((s) => s.plot_id === plot.id);
            const reading = station ? latestReadings[station.id] : null;
            const evalStatus = calculatePlotStatus(
              reading?.measured_at,
              reading?.moisture_pct,
              plot.threshold_min,
              plot.threshold_max
            );

            return (
              <React.Fragment key={plot.id}>
                <Polygon
                  coordinates={plot.polygon}
                  strokeColor={evalStatus.color}
                  fillColor={`${evalStatus.color}44`}
                  strokeWidth={2}
                  tappable
                  onPress={() => router.push(`/plot/${plot.id}` as any)}
                />
                {station && (
                  <Marker
                    coordinate={{ latitude: station.lat, longitude: station.lng }}
                    title={`${plot.name} (${plot.crop})`}
                    description={`Humedad: ${reading ? `${reading.moisture_pct}%` : 'S/D'} - ${evalStatus.label}`}
                    onCalloutPress={() => router.push(`/plot/${plot.id}` as any)}
                  />
                )}
              </React.Fragment>
            );
          })}
        </MapView>
      ) : (
        /* Vista Web alternativa si se prueba en navegador */
        <View style={styles.webFallbackContainer}>
          <Text style={styles.webFallbackTitle}>Vista Cartográfica (Emulación Web)</Text>
          <Text style={styles.webFallbackSubtitle}>
            En la app nativa (Expo Go) se dibuja el mapa interactivo con react-native-maps.
          </Text>
          <View style={styles.plotsFallbackList}>
            {plots.map((plot) => {
              const station = stations.find((s) => s.plot_id === plot.id);
              const reading = station ? latestReadings[station.id] : null;
              const evalStatus = calculatePlotStatus(
                reading?.measured_at,
                reading?.moisture_pct,
                plot.threshold_min,
                plot.threshold_max
              );

              return (
                <TouchableOpacity
                  key={plot.id}
                  style={[styles.plotWebCard, { borderLeftColor: evalStatus.color }]}
                  onPress={() => router.push(`/plot/${plot.id}` as any)}
                >
                  <View>
                    <Text style={styles.plotWebName}>{plot.name} ({plot.crop})</Text>
                    <Text style={styles.plotWebMoisture}>
                      Humedad: {reading ? `${reading.moisture_pct}%` : 'Sin lectura'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: evalStatus.badgeBg }]}>
                    <Text style={[styles.badgeText, { color: evalStatus.color }]}>
                      {evalStatus.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Leyenda fija de colores de semáforo (§8) */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>Óptimo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Seco</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Húmedo</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#64748B' }]} />
          <Text style={styles.legendText}>Stale</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#64748B', fontSize: 14 },
  topBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  orgName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  gpsInfo: { fontSize: 12, color: '#166534', fontWeight: '500', marginTop: 2 },
  map: { width: Dimensions.get('window').width, flex: 1 },
  legendContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  webFallbackContainer: { flex: 1, padding: 20 },
  webFallbackTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  webFallbackSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 16, marginTop: 4 },
  plotsFallbackList: { gap: 12 },
  plotWebCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    borderLeftWidth: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  plotWebName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  plotWebMoisture: { fontSize: 13, color: '#64748B', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});