"""Mission & waypoint schemas."""
from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


WAYPOINT_COMMAND_TO_MAV_CMD: dict[str, int] = {
    "NAV_WAYPOINT": 16,
    "NAV_LOITER_UNLIM": 17,
    "NAV_LOITER_TIME": 19,
    "NAV_RETURN_TO_LAUNCH": 20,
    "NAV_LAND": 21,
    "NAV_TAKEOFF": 22,
    "NAV_SPLINE_WAYPOINT": 82,
    "DO_CHANGE_SPEED": 178,
    "DO_SET_SERVO": 183,
    "DO_SET_ROI": 201,
    "DO_SET_CAM_TRIGG_DIST": 206,
}


MAV_CMD_TO_WAYPOINT_COMMAND: dict[int, str] = {v: k for k, v in WAYPOINT_COMMAND_TO_MAV_CMD.items()}


def waypoint_command_to_mav_cmd(command: "WaypointCommand | str") -> int:
    raw = command.value if isinstance(command, WaypointCommand) else str(command)
    if raw not in WAYPOINT_COMMAND_TO_MAV_CMD:
        raise ValueError(f"Unsupported WaypointCommand '{raw}'")
    return WAYPOINT_COMMAND_TO_MAV_CMD[raw]


def mav_cmd_to_waypoint_command(command_id: int) -> "WaypointCommand":
    raw = MAV_CMD_TO_WAYPOINT_COMMAND.get(int(command_id))
    if raw is None:
        raise ValueError(f"Unsupported MAV_CMD '{command_id}'")
    return WaypointCommand(raw)

__all__ = [
    "MissionStatus",
    "WaypointCommand",
    "WaypointCreate",
    "WaypointResponse",
    "MissionCreate",
    "MissionUpdate",
    "MissionResponse",
    "MissionUploadRequest",
    "MissionDownloadRequest",
    "MissionAssignRequest",
    "MissionUnassignRequest",
    "MissionAssignmentResponse",
    "MissionStatusUpdateRequest",
    "MissionProgressEvent",
    "MissionDownloadRequestEvent",
    "MissionDownloadResponseEvent",
    "MissionUploadEvent",
    "MissionStatusEvent",
]


class MissionStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABORTED = "aborted"
    FAILED = "failed"


class WaypointCommand(str, enum.Enum):
    NAV_WAYPOINT = "NAV_WAYPOINT"  # MAV_CMD 16
    NAV_LOITER_UNLIM = "NAV_LOITER_UNLIM"  # MAV_CMD 17
    NAV_LOITER_TIME = "NAV_LOITER_TIME"  # MAV_CMD 19
    NAV_RETURN_TO_LAUNCH = "NAV_RETURN_TO_LAUNCH"  # MAV_CMD 20
    NAV_LAND = "NAV_LAND"  # MAV_CMD 21
    NAV_TAKEOFF = "NAV_TAKEOFF"  # MAV_CMD 22
    NAV_SPLINE_WAYPOINT = "NAV_SPLINE_WAYPOINT"  # MAV_CMD 82
    DO_SET_SERVO = "DO_SET_SERVO"  # MAV_CMD 183
    DO_SET_CAM_TRIGG_DIST = "DO_SET_CAM_TRIGG_DIST"  # MAV_CMD 206
    DO_CHANGE_SPEED = "DO_CHANGE_SPEED"  # MAV_CMD 178
    DO_SET_ROI = "DO_SET_ROI"  # MAV_CMD 201


class WaypointCreate(BaseModel):
    seq: int = Field(ge=0)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    alt: float = Field(description="Altitude in meters")
    command: WaypointCommand = WaypointCommand.NAV_WAYPOINT
    param1: float = 0  # Hold time / speed / etc
    param2: float = 0  # Accept radius / etc
    param3: float = 0  # Pass through / orbit direction
    param4: float = 0  # Yaw angle
    frame: int = Field(default=3, description="MAV_FRAME: 0=global, 3=global_relative_alt")


class WaypointResponse(WaypointCreate):
    id: UUID

    model_config = {"from_attributes": True}


class MissionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    vehicle_id: UUID | None = None
    type: str = Field(default="waypoint", pattern="^(waypoint|survey|corridor|orbit)$")
    waypoints: list[WaypointCreate] = Field(default_factory=list)
    settings: dict | None = None  # speed, altitude defaults, camera settings


class MissionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    vehicle_id: UUID | None = None
    waypoints: list[WaypointCreate] | None = None
    settings: dict | None = None


class MissionResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    status: MissionStatus
    vehicle_id: UUID | None
    type: str
    waypoints: list[WaypointResponse]
    settings: dict | None
    progress: float = 0
    current_waypoint: int = 0
    total_distance: float | None = None
    estimated_duration: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    organization_id: UUID
    assigned_vehicle_ids: list[UUID] = Field(default_factory=list)
    assignments: list["MissionAssignmentResponse"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MissionUploadRequest(BaseModel):
    vehicle_id: UUID
    mission_id: UUID


class MissionDownloadRequest(BaseModel):
    vehicle_id: UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)


class MissionAssignRequest(BaseModel):
    vehicle_ids: list[UUID] = Field(min_length=1)
    replace_existing: bool = True


class MissionUnassignRequest(BaseModel):
    vehicle_ids: list[UUID] = Field(min_length=1)


class MissionAssignmentResponse(BaseModel):
    mission_id: UUID
    vehicle_id: UUID
    status: MissionStatus
    progress: float = 0
    current_waypoint: int = 0
    active: bool = True
    assigned_by: UUID | None = None
    assigned_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class MissionStatusUpdateRequest(BaseModel):
    vehicle_id: UUID
    mission_id: UUID
    status: MissionStatus
    progress: float | None = Field(default=None, ge=0, le=100)
    current_waypoint: int | None = Field(default=None, ge=0)


MissionResponse.model_rebuild()


class MissionProgressEvent(BaseModel):
    """Published to MQTT: aerocommand/{org}/mission/{vehicle_id}/progress"""
    vehicle_id: str
    mission_id: str
    current_waypoint: int
    total_waypoints: int
    progress: float = Field(ge=0, le=100)
    status: MissionStatus
    timestamp: datetime


class MissionUploadEvent(BaseModel):
    """Published to MQTT: aerocommand/{org}/mission/{vehicle_id}/upload"""

    request_id: str
    org_id: str
    vehicle_id: str
    mission: MissionResponse
    timestamp: datetime


class MissionStatusEvent(BaseModel):
    """Published to MQTT: aerocommand/{org}/mission/{vehicle_id}/status"""

    request_id: str | None = None
    org_id: str
    vehicle_id: str
    mission_id: str
    status: MissionStatus
    message: str | None = None
    progress: float | None = Field(default=None, ge=0, le=100)
    current_waypoint: int | None = None
    timestamp: datetime


class MissionDownloadRequestEvent(BaseModel):
    """Published to MQTT: aerocommand/{org}/mission/{vehicle_id}/download/request"""

    request_id: str
    org_id: str
    vehicle_id: str
    timestamp: datetime


class MissionDownloadResponseEvent(BaseModel):
    """Published to MQTT: aerocommand/{org}/mission/{vehicle_id}/download/response"""

    request_id: str
    org_id: str
    vehicle_id: str
    ok: bool
    message: str | None = None
    waypoints: list[WaypointCreate] = Field(default_factory=list)
    timestamp: datetime

