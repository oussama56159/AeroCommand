import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Radar,
  Grid3X3,
  List,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Plane,
  PlaneTakeoff,
  Car,
  Ship,
  Waves,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import ActionButton from '@/components/actions/ActionButton';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { useFleetStore } from '@/stores/fleetStore';
import { useTelemetryStore } from '@/stores/telemetryStore';
import { useUIStore } from '@/stores/uiStore';
import { VEHICLE_TYPES, ROLES } from '@/config/constants';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/stores/authStore';
import { useMissionStore } from '@/stores/missionStore';
import { userAPI } from '@/lib/api/endpoints';

function CopterTypeIcon({ rotorCount = 4, className }) {
  const getRotorPoints = () => {
    if (rotorCount === 4) {
      return [
        { x: 14, y: 14 },
        { x: 50, y: 14 },
        { x: 14, y: 50 },
        { x: 50, y: 50 },
      ];
    }

    const cx = 32;
    const cy = 32;
    const radius = 22;
    const startAngleDeg = -90;
    return Array.from({ length: rotorCount }, (_, i) => {
      const angle = ((startAngleDeg + (i * 360) / rotorCount) * Math.PI) / 180;
      return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
  };

  const points = getRotorPoints();
  return (
    <svg className={className} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {points.map((p, i) => (
        <line key={`arm-${i}`} x1="32" y1="32" x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      ))}
      {points.map((p, i) => (
        <circle key={`rotor-${i}`} cx={p.x} cy={p.y} r="7" fill="currentColor" />
      ))}

      <circle cx="32" cy="32" r="10" fill="currentColor" />
      <path d="M32 18 L27 28 L37 28 Z" fill="currentColor" />
    </svg>
  );
}

const QuadcopterIcon = (props) => <CopterTypeIcon rotorCount={4} {...props} />;
const HexacopterIcon = (props) => <CopterTypeIcon rotorCount={6} {...props} />;
const OctocopterIcon = (props) => <CopterTypeIcon rotorCount={8} {...props} />;

const VEHICLE_TYPE_ICON_MAP = {
  [VEHICLE_TYPES.QUADCOPTER]: QuadcopterIcon,
  [VEHICLE_TYPES.HEXACOPTER]: HexacopterIcon,
  [VEHICLE_TYPES.OCTOCOPTER]: OctocopterIcon,
  [VEHICLE_TYPES.FIXED_WING]: Plane,
  [VEHICLE_TYPES.VTOL]: PlaneTakeoff,
  [VEHICLE_TYPES.ROVER]: Car,
  [VEHICLE_TYPES.SUBMARINE]: Waves,
};

function VehicleCard({ vehicle, onEdit, onDelete }) {
  const telemetry = useTelemetryStore((s) => s.vehicleTelemetry[vehicle.id]);
  const navigate = useNavigate();
  const battery = telemetry?.battery ?? vehicle.battery;
  const TypeIcon = VEHICLE_TYPE_ICON_MAP[vehicle.type] || Ship;

  return (
    <Card hover onClick={() => navigate(`/app/fleet/${vehicle.id}`)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
            <TypeIcon className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{vehicle.name}</h3>
            <p className="text-xs text-slate-500">
              {vehicle.callsign} • <span>{vehicle.type}</span>
            </p>
          </div>
        </div>
        <StatusIndicator status={vehicle.status} showLabel size="md" />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center p-2 bg-slate-700/30 rounded-lg">
          <p className="text-xs text-slate-500">Battery</p>
          <p className={`text-sm font-bold mt-0.5 ${battery > 50 ? 'text-emerald-400' : battery > 20 ? 'text-amber-400' : 'text-red-400'}`}>
            {Math.round(battery)}%
          </p>
        </div>
        <div className="text-center p-2 bg-slate-700/30 rounded-lg">
          <p className="text-xs text-slate-500">Altitude</p>
          <p className="text-sm font-bold text-slate-200 mt-0.5">{telemetry?.altitude?.toFixed(0) || 0}m</p>
        </div>
        <div className="text-center p-2 bg-slate-700/30 rounded-lg">
          <p className="text-xs text-slate-500">Speed</p>
          <p className="text-sm font-bold text-slate-200 mt-0.5">{telemetry?.groundspeed?.toFixed(1) || 0} m/s</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/50">
        <Badge status={vehicle.status} dot />
        <div className="flex items-center gap-1">
          <ActionButton
            actionId="entity.vehicle.update"
            size="xs"
            variant="ghost"
            icon={Pencil}
            onAction={(e) => {
              e?.stopPropagation();
              onEdit(vehicle);
            }}
          >
            Edit
          </ActionButton>
          <ActionButton
            actionId="entity.vehicle.delete"
            size="xs"
            variant="ghost"
            icon={Trash2}
            onAction={(e) => {
              e?.stopPropagation();
              onDelete(vehicle);
            }}
          >
            Delete
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

function FleetCard({ fleet, onEdit, onDelete, onManageMembers, canManageMembers, missionCount = 0, missionRatio = 0 }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{fleet.name}</h3>
              <p className="text-xs text-slate-500">{fleet.description || 'No description'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
            <span>{fleet.vehicle_count ?? 0} vehicles</span>
            <span>{fleet.online_count ?? 0} online</span>
            <span>{missionCount} missions</span>
          </div>
          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500/80" style={{ width: `${Math.round(missionRatio * 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canManageMembers && (
            <ActionButton
              actionId="entity.fleet.assign_user"
              size="xs"
              variant="ghost"
              icon={UserPlus}
              onAction={() => onManageMembers(fleet)}
            >
              Members
            </ActionButton>
          )}
          <ActionButton
            actionId="entity.fleet.update"
            size="xs"
            variant="ghost"
            icon={Pencil}
            onAction={() => onEdit(fleet)}
          >
            Edit
          </ActionButton>
          <ActionButton
            actionId="entity.fleet.delete"
            size="xs"
            variant="ghost"
            icon={Trash2}
            onAction={() => onDelete(fleet)}
          >
            Delete
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

export default function FleetPage() {
  const vehicles = useFleetStore((s) => s.vehicles);
  const filters = useFleetStore((s) => s.filters);
  const setFilters = useFleetStore((s) => s.setFilters);
  const fetchVehicles = useFleetStore((s) => s.fetchVehicles);
  const fetchFleets = useFleetStore((s) => s.fetchFleets);
  const fleets = useFleetStore((s) => s.fleets);
  const createFleet = useFleetStore((s) => s.createFleet);
  const updateFleet = useFleetStore((s) => s.updateFleet);
  const deleteFleet = useFleetStore((s) => s.deleteFleet);
  const fetchFleetUsers = useFleetStore((s) => s.fetchFleetUsers);
  const assignUsersToFleet = useFleetStore((s) => s.assignUsersToFleet);
  const removeUserFromFleet = useFleetStore((s) => s.removeUserFromFleet);
  const createVehicle = useFleetStore((s) => s.createVehicle);
  const updateVehicle = useFleetStore((s) => s.updateVehicle);
  const deleteVehicle = useFleetStore((s) => s.deleteVehicle);
  const missions = useMissionStore((s) => s.missions);
  const fetchMissions = useMissionStore((s) => s.fetchMissions);
  const addToast = useUIStore((s) => s.addToast);
  const hasAnyRole = useAuthStore((s) => s.hasAnyRole);
  const canManageVehicles = hasAnyRole([ROLES.OPERATOR, ROLES.PILOT, ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const canManageFleets = hasAnyRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const canManageMembers = hasAnyRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
  const [viewMode, setViewMode] = useState('grid');
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [showFleetModal, setShowFleetModal] = useState(false);
  const [editingFleet, setEditingFleet] = useState(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [memberFleet, setMemberFleet] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [originalMemberIds, setOriginalMemberIds] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [fleetUsersLoading, setFleetUsersLoading] = useState(false);
  const [fleetMemberIds, setFleetMemberIds] = useState([]);
  const [originalFleetMemberIds, setOriginalFleetMemberIds] = useState([]);
  const [form, setForm] = useState({
    name: '',
    callsign: '',
    type: VEHICLE_TYPES.QUADCOPTER,
    fleet_id: '',
    firmware: '',
    serial_number: '',
    hardware_id: '',
  });
  const [fleetForm, setFleetForm] = useState({
    name: '',
    description: '',
    vehicle_ids: [],
  });
  const [originalFleetVehicleIds, setOriginalFleetVehicleIds] = useState([]);

  useEffect(() => {
    fetchVehicles();
    fetchFleets();
    fetchMissions();
  }, [fetchVehicles, fetchFleets, fetchMissions]);

  const openCreate = () => {
    setEditingVehicle(null);
    setForm({
      name: '',
      callsign: '',
      type: VEHICLE_TYPES.QUADCOPTER,
      fleet_id: '',
      firmware: '',
      serial_number: '',
      hardware_id: '',
    });
    setShowVehicleModal(true);
  };

  const openEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      name: vehicle.name || '',
      callsign: vehicle.callsign || '',
      type: vehicle.type || VEHICLE_TYPES.QUADCOPTER,
      fleet_id: vehicle.fleet_id || '',
      firmware: vehicle.firmware || '',
      serial_number: vehicle.serial_number || '',
      hardware_id: vehicle.hardware_id || '',
    });
    setShowVehicleModal(true);
  };

  const openFleetCreate = () => {
    setEditingFleet(null);
    setFleetForm({ name: '', description: '', vehicle_ids: [] });
    setOriginalFleetVehicleIds([]);
    setFleetMemberIds([]);
    setOriginalFleetMemberIds([]);
    setFleetUsersLoading(true);
    userAPI
      .list()
      .then((res) => setUsers(res.data || []))
      .catch(() => setUsers([]))
      .finally(() => setFleetUsersLoading(false));
    setShowFleetModal(true);
  };

  const openFleetEdit = (fleet) => {
    setEditingFleet(fleet);
    const assignedVehicleIds = vehicles.filter((v) => v.fleet_id === fleet.id).map((v) => v.id);
    setFleetForm({
      name: fleet.name || '',
      description: fleet.description || '',
      vehicle_ids: assignedVehicleIds,
    });
    setOriginalFleetVehicleIds(assignedVehicleIds);

    setFleetUsersLoading(true);
    Promise.all([
      fetchFleetUsers(fleet.id).catch(() => []),
      userAPI.list().then((res) => res.data).catch(() => []),
    ])
      .then(([assigned, userList]) => {
        const assignedIds = (assigned || []).map((u) => u.user_id);
        setUsers(userList || []);
        setFleetMemberIds(assignedIds);
        setOriginalFleetMemberIds(assignedIds);
      })
      .finally(() => setFleetUsersLoading(false));

    setShowFleetModal(true);
  };

  const handleFleetSave = async () => {
    if (!fleetForm.name.trim()) {
      addToast({ type: 'error', title: 'Missing fields', message: 'Fleet name is required.' });
      return;
    }
    const payload = {
      name: fleetForm.name.trim(),
      description: fleetForm.description.trim() || null,
    };
    try {
      const desiredVehicleIds = (fleetForm.vehicle_ids || []).filter(Boolean);
      const desiredMemberIds = (fleetMemberIds || []).filter(Boolean);

      let savedFleet;
      if (editingFleet) {
        savedFleet = await updateFleet(editingFleet.id, payload);
      } else {
        savedFleet = await createFleet(payload);
      }

      const fleetId = savedFleet?.id || (editingFleet ? editingFleet.id : null);
      if (fleetId) {
        const toAssign = desiredVehicleIds.filter((id) => !originalFleetVehicleIds.includes(id));
        const toUnassign = originalFleetVehicleIds.filter((id) => !desiredVehicleIds.includes(id));

        if (toAssign.length || toUnassign.length) {
          await Promise.all([
            ...toAssign.map((id) => updateVehicle(id, { fleet_id: fleetId })),
            ...toUnassign.map((id) => updateVehicle(id, { fleet_id: null })),
          ]);
        }

        const membersToAdd = desiredMemberIds.filter((id) => !originalFleetMemberIds.includes(id));
        const membersToRemove = originalFleetMemberIds.filter((id) => !desiredMemberIds.includes(id));

        if (membersToAdd.length) await assignUsersToFleet(fleetId, membersToAdd);
        for (const userId of membersToRemove) {
          await removeUserFromFleet(fleetId, userId);
        }
      }

      await Promise.all([fetchVehicles(), fetchFleets()]);

      addToast({
        type: 'success',
        title: editingFleet ? 'Fleet updated' : 'Fleet created',
        message: editingFleet ? `${payload.name} updated.` : `${payload.name} added.`,
      });
      setShowFleetModal(false);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Failed to save fleet.';
      addToast({ type: 'error', title: 'Fleet save failed', message });
    }
  };

  const eligibleFleetVehicles = editingFleet
    ? vehicles.filter((v) => !v.fleet_id || v.fleet_id === editingFleet.id)
    : vehicles.filter((v) => !v.fleet_id);

  const handleFleetDelete = async (fleet) => {
    try {
      await deleteFleet(fleet.id);
      addToast({ type: 'success', title: 'Fleet deleted', message: `${fleet.name} removed.` });
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Failed to delete fleet.';
      addToast({ type: 'error', title: 'Fleet delete failed', message });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.callsign.trim()) {
      addToast({ type: 'error', title: 'Missing fields', message: 'Name and callsign are required.' });
      return;
    }
    const serial = (form.serial_number || '').trim();
    const payload = {
      name: form.name.trim(),
      callsign: form.callsign.trim(),
      type: form.type,
      fleet_id: form.fleet_id || null,
      firmware: form.firmware || null,
      serial_number: serial || null,
      hardware_id: form.hardware_id || null,
    };
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, payload);
        addToast({ type: 'success', title: 'Vehicle updated', message: `${payload.name} updated.` });
      } else {
        await createVehicle(payload);
        addToast({ type: 'success', title: 'Vehicle created', message: `${payload.name} added.` });
      }
      setShowVehicleModal(false);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Failed to save vehicle.';
      addToast({ type: 'error', title: 'Vehicle save failed', message });
    }
  };

  const handleDelete = async (vehicle) => {
    try {
      await deleteVehicle(vehicle.id);
      await fetchVehicles();
      addToast({ type: 'success', title: 'Vehicle deleted', message: `${vehicle.name} removed.` });
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Failed to delete vehicle.';
      addToast({ type: 'error', title: 'Vehicle delete failed', message });
    }
  };

  const openMembersModal = async (fleet) => {
    if (!canManageMembers) return;
    setMemberFleet(fleet);
    setShowMembersModal(true);
    try {
      setUsersLoading(true);
      const [fleetUsers, userList] = await Promise.all([
        fetchFleetUsers(fleet.id),
        userAPI.list().then((res) => res.data),
      ]);
      const assignedIds = (fleetUsers || []).map((u) => u.user_id);
      setUsers(userList || []);
      setSelectedMemberIds(assignedIds);
      setOriginalMemberIds(assignedIds);
    } catch (err) {
      addToast({ type: 'error', title: 'User load failed', message: err?.message || 'Failed to load users.' });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSaveMembers = async () => {
    if (!memberFleet) return;
    const toAdd = selectedMemberIds.filter((id) => !originalMemberIds.includes(id));
    const toRemove = originalMemberIds.filter((id) => !selectedMemberIds.includes(id));
    try {
      if (toAdd.length) await assignUsersToFleet(memberFleet.id, toAdd);
      for (const userId of toRemove) {
        await removeUserFromFleet(memberFleet.id, userId);
      }
      addToast({ type: 'success', title: 'Members updated', message: 'Fleet membership updated.' });
      setShowMembersModal(false);
    } catch (err) {
      addToast({ type: 'error', title: 'Update failed', message: err?.message || 'Failed to update members.' });
    }
  };

  const filtered = vehicles.filter((v) => {
    if (filters.status !== 'all' && v.status !== filters.status) return false;
    if (filters.type !== 'all' && v.type !== filters.type) return false;
    if (filters.search) {
      const s = filters.search.toLowerCase();
      return v.name.toLowerCase().includes(s) || v.callsign.toLowerCase().includes(s);
    }
    return true;
  });

  const missionCountsByFleet = missions.reduce((acc, mission) => {
    const assignments = (mission.assignments || []).filter((a) => a.active);
    assignments.forEach((a) => {
      const vehicle = vehicles.find((v) => v.id === a.vehicle_id);
      if (!vehicle?.fleet_id) return;
      acc[vehicle.fleet_id] = (acc[vehicle.fleet_id] || 0) + 1;
    });
    return acc;
  }, {});
  const maxMissionCount = Math.max(1, ...Object.values(missionCountsByFleet));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Fleet Management</h1>
          <p className="text-sm text-slate-400 mt-1">{vehicles.length} vehicles • {vehicles.filter((v) => v.status !== 'offline').length} online</p>
        </div>
        {canManageVehicles ? (
          <ActionButton actionId="entity.vehicle.create" icon={Plus} onAction={openCreate}>Add Vehicle</ActionButton>
        ) : (
          <Button icon={Plus} disabled title="Requires Operator or Admin role">
            Add Vehicle
          </Button>
        )}
      </div>

      {!canManageVehicles && (
        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-200 text-sm">
          You do not have permission to add, edit, or delete vehicles. Ask an admin to grant Operator or Admin access.
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Fleets</h2>
            <p className="text-sm text-slate-400">{fleets.length} total</p>
          </div>
          {canManageFleets ? (
            <ActionButton actionId="entity.fleet.create" icon={Plus} onAction={openFleetCreate}>Add Fleet</ActionButton>
          ) : (
            <Button icon={Plus} disabled title="Requires Admin role">Add Fleet</Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {fleets.map((fleet) => (
            <FleetCard
              key={fleet.id}
              fleet={fleet}
              onEdit={openFleetEdit}
              onDelete={handleFleetDelete}
              onManageMembers={openMembersModal}
              canManageMembers={canManageMembers}
              missionCount={missionCountsByFleet[fleet.id] || 0}
              missionRatio={(missionCountsByFleet[fleet.id] || 0) / maxMissionCount}
            />
          ))}
        </div>
        {fleets.length === 0 && (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No fleets created yet</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input icon={Search} placeholder="Search vehicles..." value={filters.search} onChange={(e) => setFilters({ search: e.target.value })} />
        </div>
        <select className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded-lg px-3 py-2.5" value={filters.status} onChange={(e) => setFilters({ status: e.target.value })}>
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="in_flight">In Flight</option>
          <option value="armed">Armed</option>
          <option value="offline">Offline</option>
          <option value="maintenance">Maintenance</option>
        </select>
        <select className="bg-slate-800 border border-slate-700 text-sm text-slate-300 rounded-lg px-3 py-2.5" value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="all">All Types</option>
          {Object.entries(VEHICLE_TYPES).map(([k, v]) => <option key={k} value={v}>{v.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-1">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-slate-100' : 'text-slate-500'}`}><Grid3X3 className="w-4 h-4" /></button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-slate-100' : 'text-slate-500'}`}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4' : 'space-y-3'}>
        {filtered.map((v) => (
          <VehicleCard key={v.id} vehicle={v} onEdit={openEdit} onDelete={handleDelete} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Radar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No vehicles match your filters</p>
        </div>
      )}

      <Modal
        isOpen={showVehicleModal}
        onClose={() => setShowVehicleModal(false)}
        title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
        size="md"
        footer={
          <>
            <ActionButton actionId="nav.goto.dashboard" variant="secondary" onAction={() => setShowVehicleModal(false)}>Cancel</ActionButton>
            <ActionButton actionId={editingVehicle ? 'entity.vehicle.update' : 'entity.vehicle.create'} onAction={handleSave}>
              {editingVehicle ? 'Save Changes' : 'Create Vehicle'}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Vehicle Name" placeholder="Eagle-01" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <Input label="Callsign" placeholder="EGL01" value={form.callsign} onChange={(e) => setForm((s) => ({ ...s, callsign: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Vehicle Type</label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-300"
              value={form.type}
              onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
            >
              {Object.values(VEHICLE_TYPES).map((v) => (
                <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Fleet</label>
            <select
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-300"
              value={form.fleet_id}
              onChange={(e) => setForm((s) => ({ ...s, fleet_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {fleets.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Firmware" placeholder="PX4 1.14.3" value={form.firmware} onChange={(e) => setForm((s) => ({ ...s, firmware: e.target.value }))} />
            <div>
              <Input label="Serial Number" placeholder="Leave blank to auto-generate" value={form.serial_number} onChange={(e) => setForm((s) => ({ ...s, serial_number: e.target.value }))} />
              <p className="mt-1 text-xs text-slate-500">Leave blank to auto-generate (SN-001, SN-002, ...).</p>
            </div>
          </div>
          <Input label="Hardware ID" placeholder="HW-ABC-123" value={form.hardware_id} onChange={(e) => setForm((s) => ({ ...s, hardware_id: e.target.value }))} />
        </div>
      </Modal>

      <Modal
        isOpen={showFleetModal}
        onClose={() => setShowFleetModal(false)}
        title={editingFleet ? 'Edit Fleet' : 'Add Fleet'}
        size="md"
        footer={
          <>
            <ActionButton actionId="nav.goto.dashboard" variant="secondary" onAction={() => setShowFleetModal(false)}>Cancel</ActionButton>
            <ActionButton actionId={editingFleet ? 'entity.fleet.update' : 'entity.fleet.create'} onAction={handleFleetSave}>
              {editingFleet ? 'Save Changes' : 'Create Fleet'}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Fleet Name" placeholder="North Ops" value={fleetForm.name} onChange={(e) => setFleetForm((s) => ({ ...s, name: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-100"
              rows={3}
              placeholder="Optional notes about this fleet"
              value={fleetForm.description}
              onChange={(e) => setFleetForm((s) => ({ ...s, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Assign Vehicles (optional)</label>
            {eligibleFleetVehicles.length === 0 ? (
              <div className="text-sm text-slate-400">
                {editingFleet ? 'No unassigned vehicles available.' : 'No unassigned vehicles available.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {eligibleFleetVehicles
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((vehicle) => (
                    <label key={vehicle.id} className="flex items-center gap-3 p-2 rounded-lg border border-slate-700/60 bg-slate-800/60">
                      <input
                        type="checkbox"
                        className="accent-blue-500"
                        checked={(fleetForm.vehicle_ids || []).includes(vehicle.id)}
                        onChange={() =>
                          setFleetForm((prev) => {
                            const ids = prev.vehicle_ids || [];
                            return ids.includes(vehicle.id)
                              ? { ...prev, vehicle_ids: ids.filter((id) => id !== vehicle.id) }
                              : { ...prev, vehicle_ids: [...ids, vehicle.id] };
                          })
                        }
                      />
                      <div className="flex-1">
                        <div className="text-sm text-slate-200">{vehicle.name}</div>
                        <div className="text-xs text-slate-500">{vehicle.callsign}{vehicle.serial_number ? ` • ${vehicle.serial_number}` : ''}</div>
                      </div>
                    </label>
                  ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {editingFleet
                ? 'Shows unassigned vehicles and vehicles already in this fleet.'
                : 'Only unassigned vehicles can be selected here.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Assign Members (optional)</label>
            {fleetUsersLoading ? (
              <div className="text-sm text-slate-400">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="text-sm text-slate-400">No users available.</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-3 p-2 rounded-lg border border-slate-700/60 bg-slate-800/60">
                    <input
                      type="checkbox"
                      className="accent-blue-500"
                      checked={fleetMemberIds.includes(user.id)}
                      onChange={() =>
                        setFleetMemberIds((prev) => (
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        ))
                      }
                    />
                    <div className="flex-1">
                      <div className="text-sm text-slate-200">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email} • {user.role}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        title={memberFleet ? `Manage Members — ${memberFleet.name}` : 'Manage Members'}
        size="md"
        footer={
          <>
            <ActionButton actionId="nav.goto.dashboard" variant="secondary" onAction={() => setShowMembersModal(false)}>Cancel</ActionButton>
            <ActionButton actionId="entity.fleet.assign_user" onAction={handleSaveMembers}>Save Members</ActionButton>
          </>
        }
      >
        {usersLoading ? (
          <div className="text-sm text-slate-400">Loading users...</div>
        ) : (
          <div className="space-y-2">
            {users.length === 0 && (
              <div className="text-sm text-slate-400">No users available.</div>
            )}
            {users.map((user) => (
              <label key={user.id} className="flex items-center gap-3 p-2 rounded-lg border border-slate-700/60 bg-slate-800/60">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={selectedMemberIds.includes(user.id)}
                  onChange={() =>
                    setSelectedMemberIds((prev) => (
                      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                    ))
                  }
                />
                <div className="flex-1">
                  <div className="text-sm text-slate-200">{user.name}</div>
                  <div className="text-xs text-slate-500">{user.email} • {user.role}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

