import { create } from 'zustand';
import { vehicleAPI, fleetAPI, fleetUserAPI } from '@/lib/api/endpoints';

const MOCK_MODE_KEY = 'aero_mock_mode';

const isMockMode = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(MOCK_MODE_KEY);
    if (stored !== null) return stored === 'true';
  }
  return import.meta.env.VITE_MOCK_MODE === 'true';
};

export const useFleetStore = create((set, get) => ({
  vehicles: [],
  fleets: [],
  selectedVehicleId: null,
  selectedFleetId: null,
  isLoading: false,
  error: null,
  filters: { status: 'all', type: 'all', search: '' },
  fleetUsers: {},

  fetchVehicles: async (params) => {
    if (isMockMode()) {
      set({ isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { data } = await vehicleAPI.list(params);
      set({ vehicles: data.items || data, isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchFleets: async (params) => {
    if (isMockMode()) {
      set({ isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { data } = await fleetAPI.list(params);
      set({ fleets: data.items || data, isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchFleetUsers: async (fleetId) => {
    if (isMockMode()) {
      set((state) => ({ fleetUsers: { ...state.fleetUsers, [fleetId]: [] } }));
      return [];
    }
    try {
      const { data } = await fleetUserAPI.listFleetUsers(fleetId);
      set((state) => ({ fleetUsers: { ...state.fleetUsers, [fleetId]: data } }));
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  assignUsersToFleet: async (fleetId, userIds) => {
    if (isMockMode()) return [];
    const { data } = await fleetUserAPI.assignUsers(fleetId, { user_ids: userIds });
    set((state) => ({
      fleetUsers: { ...state.fleetUsers, [fleetId]: [...(state.fleetUsers[fleetId] || []), ...data] },
    }));
    return data;
  },

  removeUserFromFleet: async (fleetId, userId) => {
    if (isMockMode()) return;
    await fleetUserAPI.removeUser(fleetId, userId);
    set((state) => ({
      fleetUsers: {
        ...state.fleetUsers,
        [fleetId]: (state.fleetUsers[fleetId] || []).filter((u) => u.user_id !== userId),
      },
    }));
  },

  selectVehicle: (id) => set({ selectedVehicleId: id }),
  selectFleet: (id) => set({ selectedFleetId: id }),

  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),

  getFilteredVehicles: () => {
    const { vehicles, filters } = get();
    return vehicles.filter((v) => {
      if (filters.status !== 'all' && v.status !== filters.status) return false;
      if (filters.type !== 'all' && v.type !== filters.type) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        return v.name?.toLowerCase().includes(s) || v.callsign?.toLowerCase().includes(s);
      }
      return true;
    });
  },

  getVehicleById: (id) => get().vehicles.find((v) => v.id === id),

  getFleetById: (id) => get().fleets.find((f) => f.id === id),

  getOnlineCount: () => get().vehicles.filter((v) => v.status !== 'offline').length,

  getVehiclesByFleet: (fleetId) => get().vehicles.filter((v) => v.fleet_id === fleetId),

  createFleet: async (fleetData) => {
    if (isMockMode()) {
      const mockFleet = {
        ...fleetData,
        id: crypto.randomUUID(),
        vehicle_count: 0,
        online_count: 0,
        created_at: new Date().toISOString(),
      };
      set((state) => ({ fleets: [mockFleet, ...state.fleets] }));
      return mockFleet;
    }
    try {
      const { data } = await fleetAPI.create(fleetData);
      set((state) => ({ fleets: [data, ...state.fleets] }));
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  updateFleet: async (fleetId, updates) => {
    if (isMockMode()) {
      set((state) => ({
        fleets: state.fleets.map((f) => (f.id === fleetId ? { ...f, ...updates } : f)),
      }));
      return get().fleets.find((f) => f.id === fleetId);
    }
    try {
      const { data } = await fleetAPI.update(fleetId, updates);
      set((state) => ({
        fleets: state.fleets.map((f) => (f.id === fleetId ? data : f)),
      }));
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  deleteFleet: async (fleetId) => {
    if (isMockMode()) {
      set((state) => ({
        fleets: state.fleets.filter((f) => f.id !== fleetId),
        vehicles: state.vehicles.map((v) => (v.fleet_id === fleetId ? { ...v, fleet_id: null } : v)),
      }));
      return;
    }
    try {
      await fleetAPI.delete(fleetId);
      set((state) => ({
        fleets: state.fleets.filter((f) => f.id !== fleetId),
        vehicles: state.vehicles.map((v) => (v.fleet_id === fleetId ? { ...v, fleet_id: null } : v)),
      }));
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  createVehicle: async (vehicleData) => {
    if (isMockMode()) {
      const providedSerial = (vehicleData.serial_number || '').trim();
      let serial_number = providedSerial || null;
      if (!serial_number) {
        const re = /^SN-(\d+)$/;
        const maxSuffix = (get().vehicles || []).reduce((acc, v) => {
          const s = (v?.serial_number || '').trim();
          const m = re.exec(s);
          if (!m) return acc;
          const n = Number(m[1]);
          return Number.isFinite(n) ? Math.max(acc, n) : acc;
        }, 0);
        serial_number = `SN-${String(maxSuffix + 1).padStart(3, '0')}`;
      }
      const mockVehicle = {
        ...vehicleData,
        serial_number,
        id: crypto.randomUUID(),
        status: vehicleData.status || 'offline',
        created_at: new Date().toISOString(),
      };
      set((state) => ({ vehicles: [mockVehicle, ...state.vehicles] }));
      return mockVehicle;
    }
    try {
      const { data } = await vehicleAPI.create(vehicleData);
      set((state) => ({ vehicles: [data, ...state.vehicles] }));
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  updateVehicle: async (vehicleId, updates) => {
    if (isMockMode()) {
      set((state) => ({
        vehicles: state.vehicles.map((v) => (v.id === vehicleId ? { ...v, ...updates } : v)),
      }));
      return get().vehicles.find((v) => v.id === vehicleId);
    }
    try {
      const { data } = await vehicleAPI.update(vehicleId, updates);
      set((state) => ({
        vehicles: state.vehicles.map((v) => (v.id === vehicleId ? data : v)),
      }));
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  deleteVehicle: async (vehicleId) => {
    if (isMockMode()) {
      set((state) => ({ vehicles: state.vehicles.filter((v) => v.id !== vehicleId) }));
      return;
    }
    try {
      await vehicleAPI.delete(vehicleId);
      set((state) => ({ vehicles: state.vehicles.filter((v) => v.id !== vehicleId) }));
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  sendCommand: async (vehicleId, command) => {
    try {
      const { data } = await vehicleAPI.sendCommand(vehicleId, command);
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },
}));

