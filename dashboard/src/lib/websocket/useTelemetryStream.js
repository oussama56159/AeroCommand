import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { useFleetStore } from '@/stores/fleetStore';
import { useAuthStore } from '@/stores/authStore';
import wsManager from './WebSocketManager';

export function useTelemetryStream(vehicleId) {
  const updateTelemetry = useTelemetryStore((s) => s.updateVehicleTelemetry);
  const setConnectionStatus = useTelemetryStore((s) => s.setConnectionStatus);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!vehicleId) return;
    const channel = `vehicle:${vehicleId}`;
    channelRef.current = channel;

    wsManager.connect(channel, {
      onOpen: () => setConnectionStatus(vehicleId, 'connected'),
      onMessage: (data) => {
        if (data?.type === 'telemetry' && data?.data) {
          updateTelemetry(vehicleId, data.data);
        }
      },
      onClose: () => setConnectionStatus(vehicleId, 'disconnected'),
      onError: () => setConnectionStatus(vehicleId, 'error'),
    });

    return () => {
      wsManager.disconnect(channel);
      channelRef.current = null;
    };
  }, [vehicleId, updateTelemetry, setConnectionStatus]);

  const sendCommand = useCallback(
    (command) => {
      if (channelRef.current) {
        return wsManager.send(channelRef.current, { type: 'command', ...command });
      }
      return false;
    },
    []
  );

  return { sendCommand };
}

export function useFleetTelemetryStream(vehicleIds) {
  const updateTelemetry = useTelemetryStore((s) => s.updateVehicleTelemetry);
  const setConnectionStatus = useTelemetryStore((s) => s.setConnectionStatus);
  const syncVehicleTelemetry = useFleetStore((s) => s.syncVehicleTelemetry);
  const orgId = useAuthStore((s) => s.user?.organization_id);
  const vehicleIdsRef = useRef(vehicleIds || []);
  const vehicleKey = useMemo(() => (vehicleIds || []).slice().sort().join('|'), [vehicleIds]);

  useEffect(() => {
    vehicleIdsRef.current = vehicleIds || [];
  }, [vehicleIds]);

  useEffect(() => {
    const channel = orgId ? `org:${orgId}` : null;
    if (!channel) return;
    wsManager.connect(channel, {
      onOpen: () => {
        vehicleIdsRef.current.forEach((id) => setConnectionStatus(id, 'connected'));
      },
      onMessage: (data) => {
        if (data?.type === 'telemetry' && data?.vehicle_id && data?.data) {
          updateTelemetry(data.vehicle_id, data.data);
          syncVehicleTelemetry(data.vehicle_id, data.data);
        }
      },
      onClose: () => {
        vehicleIdsRef.current.forEach((id) => setConnectionStatus(id, 'disconnected'));
      },
    });

    return () => wsManager.disconnect(channel);
  }, [orgId, vehicleKey, updateTelemetry, setConnectionStatus, syncVehicleTelemetry]);
}

export function useAlertStream() {
  const addAlert = useTelemetryStore((s) => s.addAlert);
  const orgId = useAuthStore((s) => s.user?.organization_id);

  useEffect(() => {
    if (!orgId) return;
    const channel = `alerts:${orgId}`;
    wsManager.connect(channel, {
      onMessage: (data) => {
        if (data?.type === 'alert' && data?.data) addAlert(data.data);
      },
    });
    return () => wsManager.disconnect(channel);
  }, [addAlert, orgId]);
}

