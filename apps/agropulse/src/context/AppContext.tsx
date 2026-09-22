import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Membership, Organization, UserRole, Plot, Station, Reading, Valve } from '../types';

interface AppContextType {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  organization: Organization | null;
  plots: Plot[];
  stations: Station[];
  latestReadings: Record<string, Reading>; // station_id -> Reading
  valves: Valve[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const [plots, setPlots] = useState<Plot[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [latestReadings, setLatestReadings] = useState<Record<string, Reading>>({});
  const [valves, setValves] = useState<Valve[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Cargar Sesión y Membresía inicial
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setSession(null);
        setUser(null);
        setRole(null);
        setOrganization(null);
        setPlots([]);
        setStations([]);
        setLatestReadings({});
        setValves([]);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Traer Organización y Rol
  const fetchUserData = async (userId: string) => {
    setIsLoading(true);
    try {
      const { data: memData } = await supabase
        .from('memberships')
        .select('role, organization_id, organizations(*)')
        .eq('user_id', userId)
        .single();

      if (memData) {
        setRole(memData.role as UserRole);
        setOrganization((memData as any).organizations as Organization);
        await loadCoreData(memData.organization_id);
      }
    } catch (err) {
      console.error('[AppContext] Error fetchUserData:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Traer Lotes, Estaciones, Válvulas y Últimas Lecturas
  const loadCoreData = async (orgId: string) => {
    try {
      // Plots
      const { data: plotsData } = await supabase
        .from('plots')
        .select('*')
        .eq('organization_id', orgId);

      const activePlots = (plotsData as Plot[]) || [];
      setPlots(activePlots);

      if (activePlots.length === 0) return;
      const plotIds = activePlots.map((p) => p.id);

      // Stations
      const { data: stationsData } = await supabase
        .from('stations')
        .select('*')
        .in('plot_id', plotIds);
      const activeStations = (stationsData as Station[]) || [];
      setStations(activeStations);

      // Valves
      const { data: valvesData } = await supabase
        .from('valves')
        .select('*')
        .in('plot_id', plotIds);
      setValves((valvesData as Valve[]) || []);

      // Readings recientes
      if (activeStations.length > 0) {
        const stationIds = activeStations.map((s) => s.id);
        const { data: readingsData } = await supabase
          .from('readings')
          .select('*')
          .in('station_id', stationIds)
          .order('measured_at', { ascending: false });

        const map: Record<string, Reading> = {};
        ((readingsData as Reading[]) || []).forEach((r) => {
          if (!map[r.station_id]) {
            map[r.station_id] = r;
          }
        });
        setLatestReadings(map);
      }
    } catch (e) {
      console.error('[AppContext] Error loadCoreData:', e);
    }
  };

  // 4. Suscripción Supabase Realtime (readings y valves)
  useEffect(() => {
    if (!organization) return;

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'readings' },
        (payload) => {
          const newReading = payload.new as Reading;
          setLatestReadings((prev) => ({
            ...prev,
            [newReading.station_id]: newReading,
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'valves' },
        (payload) => {
          const updatedValve = payload.new as Valve;
          setValves((prev) =>
            prev.map((v) => (v.id === updatedValve.id ? updatedValve : v))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization]);

  const refreshData = async () => {
    if (organization) await loadCoreData(organization.id);
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[AppContext] Error signing out:', e);
    } finally {
      setSession(null);
      setUser(null);
      setRole(null);
      setOrganization(null);
      setPlots([]);
      setStations([]);
      setLatestReadings({});
      setValves([]);
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        session,
        user,
        role,
        organization,
        plots,
        stations,
        latestReadings,
        valves,
        isLoading,
        refreshData,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider');
  return context;
};