"""Fleet & Vehicle business logic."""
from __future__ import annotations

import re
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Integer, cast, delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.shared.schemas.auth import Role
from backend.shared.schemas.vehicle import (
    FleetCreate,
    FleetResponse,
    FleetUpdate,
    FleetUserAssignmentResponse,
    GeoPosition,
    VehicleCreate,
    VehicleListResponse,
    VehicleResponse,
    VehicleStatus,
    VehicleUpdate,
)

from backend.services.auth.models import User
from .models import Fleet, FleetUserAssignment, Vehicle

_SERIAL_RE = re.compile(r"^SN-(\d+)$")
_SERIAL_PREFIX = "SN-"
_SERIAL_PAD = 3

# Global advisory lock key for serial-number generation.
# Must fit in signed 64-bit integer.
_SERIAL_ADVISORY_LOCK_KEY = 7348972349872


async def _generate_next_vehicle_serial_number(db: AsyncSession) -> str:
    """Generate the next sequential serial number (SN-001, SN-002, ...).

    - Global sequence (not per org/fleet)
    - Does not renumber on delete (gaps are fine)
    - Uses a Postgres advisory transaction lock when running on Postgres
    """

    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": _SERIAL_ADVISORY_LOCK_KEY},
        )

        serial_digits = func.substring(Vehicle.serial_number, r"^SN-(\d+)$")
        stmt = (
            select(func.max(cast(serial_digits, Integer)))
            .where(Vehicle.serial_number.is_not(None))
            .where(Vehicle.serial_number.like(f"{_SERIAL_PREFIX}%"))
        )
        max_suffix = (await db.execute(stmt)).scalar()
        next_num = int(max_suffix or 0) + 1
        return f"{_SERIAL_PREFIX}{next_num:0{_SERIAL_PAD}d}"

    # Portable fallback: parse existing serials in Python.
    result = await db.execute(select(Vehicle.serial_number).where(Vehicle.serial_number.is_not(None)))
    max_suffix = 0
    for (serial,) in result.all():
        if not serial:
            continue
        match = _SERIAL_RE.match(serial.strip())
        if match:
            max_suffix = max(max_suffix, int(match.group(1)))
    next_num = max_suffix + 1
    return f"{_SERIAL_PREFIX}{next_num:0{_SERIAL_PAD}d}"


# ── Vehicle CRUD ──

async def create_vehicle(db: AsyncSession, org_id: UUID, data: VehicleCreate) -> VehicleResponse:
    serial = (data.serial_number or "").strip() or None
    if serial is None:
        serial = await _generate_next_vehicle_serial_number(db)

    vehicle = Vehicle(
        name=data.name,
        callsign=data.callsign,
        type=data.type,
        fleet_id=data.fleet_id,
        organization_id=org_id,
        firmware=data.firmware,
        serial_number=serial,
        hardware_id=data.hardware_id,
        metadata_json=data.metadata,
    )
    if data.home_position:
        vehicle.home_lat = data.home_position.lat
        vehicle.home_lng = data.home_position.lng
        vehicle.home_alt = data.home_position.alt
    db.add(vehicle)
    await db.flush()
    await db.refresh(vehicle)
    return _vehicle_to_response(vehicle)


async def get_vehicle(db: AsyncSession, org_id: UUID, vehicle_id: UUID, *, user: dict | None = None) -> VehicleResponse:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _assert_vehicle_access(db, org_id, vehicle, user)
    return _vehicle_to_response(vehicle)


async def list_vehicles(
    db: AsyncSession,
    org_id: UUID,
    page: int = 1,
    page_size: int = 50,
    fleet_id: UUID | None = None,
    status_filter: VehicleStatus | None = None,
    *,
    user: dict | None = None,
) -> VehicleListResponse:
    query = select(Vehicle).where(Vehicle.organization_id == org_id)
    if fleet_id:
        query = query.where(Vehicle.fleet_id == fleet_id)
    if status_filter:
        query = query.where(Vehicle.status == status_filter)

    allowed = await _get_allowed_fleet_ids(db, org_id, user)
    if allowed is not None:
        if not allowed:
            return VehicleListResponse(items=[], total=0, page=page, page_size=page_size)
        query = query.where(Vehicle.fleet_id.in_(allowed))

    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    vehicles = result.scalars().all()

    return VehicleListResponse(
        items=[_vehicle_to_response(v) for v in vehicles],
        total=total, page=page, page_size=page_size,
    )


async def update_vehicle(
    db: AsyncSession, org_id: UUID, vehicle_id: UUID, data: VehicleUpdate, *, user: dict | None = None
) -> VehicleResponse:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _assert_vehicle_access(db, org_id, vehicle, user)

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "home_position" and value:
            vehicle.home_lat = value["lat"]
            vehicle.home_lng = value["lng"]
            vehicle.home_alt = value.get("alt", 0)
        elif field == "metadata":
            vehicle.metadata_json = value
        elif hasattr(vehicle, field):
            setattr(vehicle, field, value)

    await db.flush()
    await db.refresh(vehicle)
    return _vehicle_to_response(vehicle)


async def delete_vehicle(db: AsyncSession, org_id: UUID, vehicle_id: UUID, *, user: dict | None = None) -> None:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _assert_vehicle_access(db, org_id, vehicle, user)

    # Vehicles may be referenced by mission assignments.
    # To allow deletion (as a registry cleanup action), remove those assignments first.
    # Also clear any direct mission.vehicle_id references (not an FK, but keeps data consistent).
    from backend.services.mission.models import Mission, MissionAssignment  # local import to avoid circular imports

    await db.execute(
        delete(MissionAssignment).where(MissionAssignment.vehicle_id == vehicle.id)
    )
    await db.execute(
        update(Mission).where(Mission.vehicle_id == vehicle.id).values(vehicle_id=None)
    )
    await db.delete(vehicle)


# ── Fleet CRUD ──

async def create_fleet(db: AsyncSession, org_id: UUID, data: FleetCreate) -> FleetResponse:
    fleet = Fleet(name=data.name, description=data.description, organization_id=org_id)
    db.add(fleet)
    await db.flush()
    await db.refresh(fleet)
    return await _fleet_to_response(db, fleet)


async def list_fleets(db: AsyncSession, org_id: UUID, *, user: dict | None = None) -> list[FleetResponse]:
    query = select(Fleet).where(Fleet.organization_id == org_id)
    allowed = await _get_allowed_fleet_ids(db, org_id, user)
    if allowed is not None:
        if not allowed:
            return []
        query = query.where(Fleet.id.in_(allowed))
    result = await db.execute(query)
    fleets = result.scalars().all()
    return [await _fleet_to_response(db, f) for f in fleets]


async def update_fleet(db: AsyncSession, org_id: UUID, fleet_id: UUID, data: FleetUpdate) -> FleetResponse:
    result = await db.execute(
        select(Fleet).where(Fleet.id == fleet_id, Fleet.organization_id == org_id)
    )
    fleet = result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="Fleet not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        if hasattr(fleet, field):
            setattr(fleet, field, value)

    await db.flush()
    await db.refresh(fleet)
    return await _fleet_to_response(db, fleet)


async def delete_fleet(db: AsyncSession, org_id: UUID, fleet_id: UUID) -> None:
    result = await db.execute(
        select(Fleet).where(Fleet.id == fleet_id, Fleet.organization_id == org_id)
    )
    fleet = result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="Fleet not found")

    # Do not delete vehicles when deleting a fleet.
    # Instead, unassign all vehicles from the fleet.
    await db.execute(
        update(Vehicle)
        .where(Vehicle.organization_id == org_id, Vehicle.fleet_id == fleet.id)
        .values(fleet_id=None)
    )

    await db.delete(fleet)


async def assign_users_to_fleet(
    db: AsyncSession,
    org_id: UUID,
    fleet_id: UUID,
    user_ids: list[UUID],
    *,
    assigned_by: UUID | None = None,
) -> list[FleetUserAssignmentResponse]:
    result = await db.execute(
        select(Fleet).where(Fleet.id == fleet_id, Fleet.organization_id == org_id)
    )
    fleet = result.scalar_one_or_none()
    if not fleet:
        raise HTTPException(status_code=404, detail="Fleet not found")

    users = (await db.execute(
        select(User).where(User.id.in_(user_ids), User.organization_id == org_id)
    )).scalars().all()
    existing = (await db.execute(
        select(FleetUserAssignment).where(
            FleetUserAssignment.fleet_id == fleet_id,
            FleetUserAssignment.user_id.in_(user_ids),
        )
    )).scalars().all()
    existing_ids = {a.user_id for a in existing}

    assignments = []
    for user in users:
        if user.id in existing_ids:
            continue
        assignment = FleetUserAssignment(
            fleet_id=fleet_id,
            user_id=user.id,
            assigned_by=assigned_by,
        )
        db.add(assignment)
        assignments.append(assignment)

    await db.flush()
    return [
        FleetUserAssignmentResponse(
            fleet_id=a.fleet_id,
            user_id=a.user_id,
            assigned_by=a.assigned_by,
            assigned_at=a.assigned_at,
        ) for a in assignments
    ]


async def remove_user_from_fleet(db: AsyncSession, org_id: UUID, fleet_id: UUID, user_id: UUID) -> None:
    result = await db.execute(
        select(FleetUserAssignment)
        .join(Fleet, Fleet.id == FleetUserAssignment.fleet_id)
        .where(Fleet.id == fleet_id, Fleet.organization_id == org_id, FleetUserAssignment.user_id == user_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)


async def list_fleet_users(db: AsyncSession, org_id: UUID, fleet_id: UUID) -> list[FleetUserAssignmentResponse]:
    result = await db.execute(
        select(FleetUserAssignment)
        .join(Fleet, Fleet.id == FleetUserAssignment.fleet_id)
        .where(Fleet.id == fleet_id, Fleet.organization_id == org_id)
    )
    assignments = result.scalars().all()
    return [
        FleetUserAssignmentResponse(
            fleet_id=a.fleet_id,
            user_id=a.user_id,
            assigned_by=a.assigned_by,
            assigned_at=a.assigned_at,
        ) for a in assignments
    ]


async def list_user_fleets(db: AsyncSession, org_id: UUID, user_id: UUID) -> list[FleetResponse]:
    result = await db.execute(
        select(Fleet)
        .join(FleetUserAssignment, FleetUserAssignment.fleet_id == Fleet.id)
        .where(Fleet.organization_id == org_id, FleetUserAssignment.user_id == user_id)
    )
    fleets = result.scalars().all()
    return [await _fleet_to_response(db, f) for f in fleets]


async def _get_allowed_fleet_ids(db: AsyncSession, org_id: UUID, user: dict | None) -> set[UUID] | None:
    if not user:
        return None
    role = user.get("role")
    if role in (Role.ADMIN.value, Role.SUPER_ADMIN.value):
        return None

    user_id = user.get("user_id")
    if not user_id:
        return set()
    result = await db.execute(
        select(FleetUserAssignment.fleet_id)
        .join(Fleet, Fleet.id == FleetUserAssignment.fleet_id)
        .where(Fleet.organization_id == org_id, FleetUserAssignment.user_id == UUID(user_id))
    )
    return {row[0] for row in result.all()}


async def _assert_vehicle_access(db: AsyncSession, org_id: UUID, vehicle: Vehicle, user: dict | None) -> None:
    if not user:
        return
    role = user.get("role")
    if role in (Role.ADMIN.value, Role.SUPER_ADMIN.value):
        return
    allowed = await _get_allowed_fleet_ids(db, org_id, user)
    if allowed is not None and vehicle.fleet_id not in allowed:
        raise HTTPException(status_code=403, detail="Fleet access denied")


async def ensure_vehicle_access(db: AsyncSession, org_id: UUID, vehicle_id: UUID, user: dict | None) -> None:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _assert_vehicle_access(db, org_id, vehicle, user)


async def ensure_vehicle_access(db: AsyncSession, org_id: UUID, vehicle_id: UUID, user: dict | None) -> None:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.organization_id == org_id)
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _assert_vehicle_access(db, org_id, vehicle, user)


# ── Helpers ──

def _vehicle_to_response(v: Vehicle) -> VehicleResponse:
    pos = None
    if v.current_lat is not None and v.current_lng is not None:
        pos = GeoPosition(lat=v.current_lat, lng=v.current_lng, alt=v.current_alt or 0)
    home = None
    if v.home_lat is not None and v.home_lng is not None:
        home = GeoPosition(lat=v.home_lat, lng=v.home_lng, alt=v.home_alt or 0)

    return VehicleResponse(
        id=v.id, name=v.name, callsign=v.callsign, type=v.type,
        status=v.status, fleet_id=v.fleet_id, firmware=v.firmware,
        serial_number=v.serial_number, hardware_id=v.hardware_id,
        home_position=home, position=pos, battery=v.battery,
        gps_fix=v.gps_fix, satellites=v.satellites, mode=v.mode,
        armed=v.armed, uptime=v.uptime, last_seen=v.last_seen,
        created_at=v.created_at, organization_id=v.organization_id,
    )


async def _fleet_to_response(db: AsyncSession, f: Fleet) -> FleetResponse:
    total = (await db.execute(
        select(func.count()).where(Vehicle.fleet_id == f.id)
    )).scalar() or 0
    online = (await db.execute(
        select(func.count()).where(Vehicle.fleet_id == f.id, Vehicle.status != VehicleStatus.OFFLINE)
    )).scalar() or 0
    return FleetResponse(
        id=f.id, name=f.name, description=f.description,
        vehicle_count=total, online_count=online,
        organization_id=f.organization_id, created_at=f.created_at,
    )

