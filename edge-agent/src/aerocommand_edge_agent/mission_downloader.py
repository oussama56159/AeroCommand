from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

from backend.shared.mqtt_topics import MQTTTopics
from backend.shared.schemas.mission import (
    MissionDownloadRequestEvent,
    MissionDownloadResponseEvent,
    mav_cmd_to_waypoint_command,
    WaypointCreate,
)

from .mavlink_reader import MavlinkReader

logger = logging.getLogger(__name__)


async def download_mission_from_autopilot(
    *,
    reader: MavlinkReader,
    event: MissionDownloadRequestEvent,
    publish_json: Callable[[str, dict], Awaitable[None]],
    request_timeout_s: float = 30.0,
) -> None:
    """Download the current mission from the connected autopilot and publish a response over MQTT."""

    org_id = str(event.org_id)
    vehicle_id = str(event.vehicle_id)
    response_topic = MQTTTopics.mission_download_response(org_id, vehicle_id)

    def now() -> datetime:
        return datetime.now(tz=timezone.utc)

    master = reader.master
    target_system = int(getattr(master, "target_system", 1) or 1)
    target_component = int(getattr(master, "target_component", 1) or 1)

    try:
        # Ask autopilot for mission size.
        try:
            try:
                master.mav.mission_request_list_send(target_system, target_component, 0)
            except TypeError:
                master.mav.mission_request_list_send(target_system, target_component)
        except Exception as exc:
            raise RuntimeError(f"Failed to send MISSION_REQUEST_LIST: {exc}")

        count_msg = await reader.wait_for("MISSION_COUNT", timeout_s=request_timeout_s)
        count = int(count_msg.data.get("count") or 0)
        if count <= 0:
            resp = MissionDownloadResponseEvent(
                request_id=event.request_id,
                org_id=org_id,
                vehicle_id=vehicle_id,
                ok=False,
                message="Vehicle returned zero mission items",
                waypoints=[],
                timestamp=now(),
            )
            await publish_json(response_topic, resp.model_dump(mode="json"))
            return

        waypoints: list[WaypointCreate] = []

        for seq in range(count):
            # Request each item; prefer *_INT.
            try:
                try:
                    master.mav.mission_request_int_send(target_system, target_component, seq, 0)
                except TypeError:
                    master.mav.mission_request_int_send(target_system, target_component, seq)
            except Exception:
                try:
                    try:
                        master.mav.mission_request_send(target_system, target_component, seq, 0)
                    except TypeError:
                        master.mav.mission_request_send(target_system, target_component, seq)
                except Exception as exc:
                    raise RuntimeError(f"Failed to request mission item seq={seq}: {exc}")

            item = await reader.wait_for(
                ("MISSION_ITEM_INT", "MISSION_ITEM"),
                predicate=lambda d, s=seq: d.get("seq") is not None and int(d.get("seq")) == s,
                timeout_s=request_timeout_s,
            )

            command_id = int(item.data.get("command") or 0)
            command = mav_cmd_to_waypoint_command(command_id)

            frame = int(item.data.get("frame") or 3)
            param1 = float(item.data.get("param1") or 0.0)
            param2 = float(item.data.get("param2") or 0.0)
            param3 = float(item.data.get("param3") or 0.0)
            param4 = float(item.data.get("param4") or 0.0)

            if item.name == "MISSION_ITEM_INT":
                lat = float(item.data.get("x") or 0) / 1e7
                lng = float(item.data.get("y") or 0) / 1e7
                alt = float(item.data.get("z") or 0.0)
            else:
                lat = float(item.data.get("x") or 0.0)
                lng = float(item.data.get("y") or 0.0)
                alt = float(item.data.get("z") or 0.0)

            waypoints.append(
                WaypointCreate(
                    seq=seq,
                    lat=lat,
                    lng=lng,
                    alt=alt,
                    command=command,
                    param1=param1,
                    param2=param2,
                    param3=param3,
                    param4=param4,
                    frame=frame,
                )
            )

        # Some firmwares expect an ACK from the downloader; send best-effort.
        try:
            try:
                master.mav.mission_ack_send(target_system, target_component, 0, 0)
            except TypeError:
                master.mav.mission_ack_send(target_system, target_component, 0)
        except Exception:
            pass

        resp = MissionDownloadResponseEvent(
            request_id=event.request_id,
            org_id=org_id,
            vehicle_id=vehicle_id,
            ok=True,
            waypoints=waypoints,
            timestamp=now(),
        )
        await publish_json(response_topic, resp.model_dump(mode="json"))

    except asyncio.TimeoutError:
        resp = MissionDownloadResponseEvent(
            request_id=event.request_id,
            org_id=org_id,
            vehicle_id=vehicle_id,
            ok=False,
            message="Timed out waiting for autopilot mission download",
            waypoints=[],
            timestamp=now(),
        )
        await publish_json(response_topic, resp.model_dump(mode="json"))
    except Exception as exc:
        logger.exception("Mission download failed")
        resp = MissionDownloadResponseEvent(
            request_id=event.request_id,
            org_id=org_id,
            vehicle_id=vehicle_id,
            ok=False,
            message=str(exc),
            waypoints=[],
            timestamp=now(),
        )
        await publish_json(response_topic, resp.model_dump(mode="json"))
