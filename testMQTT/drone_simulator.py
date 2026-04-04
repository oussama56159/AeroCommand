import json
import math
import os
import random
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover
    print("Missing dependency: paho-mqtt. Install with: pip install paho-mqtt")
    sys.exit(1)


@dataclass
class DroneConfig:
    mqtt_host: str = os.getenv("MQTT_HOST", "localhost")
    mqtt_port: int = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_username: Optional[str] = os.getenv("MQTT_USERNAME")
    mqtt_password: Optional[str] = os.getenv("MQTT_PASSWORD")
    client_id: str = os.getenv("DRONE_CLIENT_ID", "drone001")

    # When enabled, publish AeroCommand TelemetryFrame payloads to:
    #   aerocommand/{org_id}/telemetry/{vehicle_id}/raw
    # and listen for command requests on:
    #   aerocommand/{org_id}/command/{vehicle_id}/request
    aerocommand_enabled: bool = os.getenv("AEROCOMMAND_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
    aerocommand_org_id: str = os.getenv("AEROCOMMAND_ORG_ID", "").strip()
    aerocommand_vehicle_id: str = os.getenv("AEROCOMMAND_VEHICLE_ID", "").strip()

    telemetry_topic: str = os.getenv("DRONE_TELEMETRY_TOPIC", "drones/drone001/telemetry")
    status_topic: str = os.getenv("DRONE_STATUS_TOPIC", "drones/drone001/status")
    control_topic: str = os.getenv("DRONE_CONTROL_TOPIC", "drones/drone001/control")

    update_hz: float = float(os.getenv("DRONE_UPDATE_HZ", "5"))
    noise: float = float(os.getenv("DRONE_NOISE", "0.00003"))
    battery_drain_idle: float = float(os.getenv("DRONE_BATT_DRAIN_IDLE", "0.002"))
    battery_drain_move: float = float(os.getenv("DRONE_BATT_DRAIN_MOVE", "0.02"))

    home_lat: float = float(os.getenv("DRONE_HOME_LAT", "36.8065"))
    home_lng: float = float(os.getenv("DRONE_HOME_LNG", "10.1815"))
    home_alt: float = float(os.getenv("DRONE_HOME_ALT", "0"))
    target_alt: float = float(os.getenv("DRONE_TARGET_ALT", "80"))

    loss_chance_per_min: float = float(os.getenv("DRONE_LOSS_CHANCE", "0.02"))
    loss_duration_sec: float = float(os.getenv("DRONE_LOSS_DURATION", "6"))


class DroneSimulator:
    def __init__(self, config: DroneConfig) -> None:
        self.cfg = config
        self._default_target_alt = config.target_alt
        self.client = mqtt.Client(client_id=self.cfg.client_id)
        if self.cfg.mqtt_username:
            self.client.username_pw_set(self.cfg.mqtt_username, self.cfg.mqtt_password)

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

        self.running = True
        self.connected = False

        self.armed = False
        self.mode = "IDLE"  # AUTO, GUIDED, LOITER, RTL, LAND
        self.status = "idle"  # idle, flying, landing, emergency
        self.mission_active = False

        self.lat = self.cfg.home_lat
        self.lng = self.cfg.home_lng
        self.alt = self.cfg.home_alt
        self.heading = 90.0
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 90.0
        self.speed = 0.0
        self.vertical_speed = 0.0

        self.battery = 100.0
        self.signal_strength = 100.0
        self.health = "ok"

        self._seq = 0

        self._loss_until = 0.0
        self._reset_cycle_state()

    def _reset_cycle_state(self) -> None:
        self.armed = False
        self.mode = "IDLE"
        self.status = "idle"
        self.mission_active = False

        self.lat = self.cfg.home_lat
        self.lng = self.cfg.home_lng
        self.alt = self.cfg.home_alt
        self.heading = 90.0
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 90.0
        self.speed = 0.0
        self.vertical_speed = 0.0
        self.cfg.target_alt = self._default_target_alt

    def _on_connect(self, client, userdata, flags, rc):
        self.connected = True
        if self.cfg.aerocommand_enabled:
            client.subscribe(self._command_topic())
        else:
            client.subscribe(self.cfg.control_topic)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8")) if msg.payload else {}
        except Exception:
            payload = {}

        command = (payload.get("command") or payload.get("action") or "").lower()
        params = payload.get("params") or {}

        if command in ("arm", "disarm"):
            self.armed = command == "arm"
            if not self.armed:
                self._reset_cycle_state()
        elif command == "takeoff" and self.armed:
            self.mode = "GUIDED"
            self.status = "flying"
            self.speed = max(self.speed, 4.0)
            self.cfg.target_alt = float(params.get("alt", self.cfg.target_alt))
        elif command == "land":
            self.mode = "LAND"
            self.status = "landing"
        elif command == "rtl":
            self.mode = "RTL"
            self.status = "flying"
        elif command == "loiter":
            self.mode = "LOITER"
            self.status = "flying"
            self.speed = max(self.speed, 1.5)
        elif command == "guided":
            self.mode = "GUIDED"
            self.status = "flying"
            self.speed = max(self.speed, 4.0)
        elif command == "auto":
            self.mode = "AUTO"
            self.status = "flying"
            self.mission_active = True
            self.speed = max(self.speed, 6.0)
        elif command == "start_mission":
            self.mode = "AUTO"
            self.status = "flying"
            self.mission_active = True
        elif command == "pause_mission":
            self.mission_active = False
            self.mode = "LOITER"
        elif command == "resume_mission":
            self.mission_active = True
            self.mode = "AUTO"
        elif command == "emergency_stop":
            self.status = "emergency"
            self.mode = "EMERGENCY"
            self.speed = 0.0
            self.vertical_speed = -2.0

    def _simulate_link(self, now: float) -> None:
        if now < self._loss_until:
            self.connected = False
            self.signal_strength = max(0.0, self.signal_strength - 2.0)
            return

        self.connected = True
        self.signal_strength = min(100.0, self.signal_strength + 0.5)

        if random.random() < (self.cfg.loss_chance_per_min / 60.0):
            self._loss_until = now + self.cfg.loss_duration_sec

    def _update_motion(self, dt: float) -> None:
        if self.status == "emergency":
            self.alt = max(0.0, self.alt + self.vertical_speed * dt)
            return

        if not self.armed:
            self.speed = 0.0
            self.vertical_speed = 0.0
            self.status = "idle"
            return

        if self.mode == "IDLE":
            self.speed = 0.0
            self.vertical_speed = 0.0
            self.status = "idle"
            return

        if self.mode == "LAND":
            self.vertical_speed = -1.5
            self.alt = max(0.0, self.alt + self.vertical_speed * dt)
            if self.alt <= 1.0:
                self._reset_cycle_state()
            return

        if self.mode == "RTL":
            self._navigate_to(self.cfg.home_lat, self.cfg.home_lng, dt)
            if self._distance_to(self.cfg.home_lat, self.cfg.home_lng) < 8:
                self.mode = "LAND"
                self.status = "landing"
            return

        if self.mode == "LOITER":
            self.speed = max(0.5, self.speed * 0.95)
        elif self.mode == "AUTO" and self.mission_active:
            self._mission_pattern(dt)
        elif self.mode == "GUIDED":
            self._guided_pattern(dt)

        if self.alt < self.cfg.target_alt:
            self.vertical_speed = 1.0
        else:
            self.vertical_speed = 0.0
        self.alt = max(0.0, self.alt + self.vertical_speed * dt)

    def _mission_pattern(self, dt: float) -> None:
        self.speed = max(self.speed, 6.0)
        self.heading = (self.heading + 8.0 * dt) % 360
        self._move_forward(dt)

    def _guided_pattern(self, dt: float) -> None:
        self.speed = max(self.speed, 4.0)
        self.heading = (self.heading + 4.0 * dt) % 360
        self._move_forward(dt)

    def _move_forward(self, dt: float) -> None:
        heading_rad = math.radians(self.heading)
        meters = self.speed * dt
        lat_scale = 111_111.0
        lon_scale = 111_111.0 * math.cos(math.radians(self.lat))
        dlat = (meters * math.cos(heading_rad)) / lat_scale
        dlon = (meters * math.sin(heading_rad)) / lon_scale
        self.lat += dlat + random.uniform(-self.cfg.noise, self.cfg.noise)
        self.lng += dlon + random.uniform(-self.cfg.noise, self.cfg.noise)
        self.roll = max(-15.0, min(15.0, (self.speed / 6.0) * 8.0 + random.uniform(-1.5, 1.5)))
        self.pitch = max(-10.0, min(10.0, (self.speed / 6.0) * 5.0 + random.uniform(-1.0, 1.0)))
        self.yaw = self.heading

    def _navigate_to(self, target_lat: float, target_lng: float, dt: float) -> None:
        dy = (target_lat - self.lat) * 111_111.0
        dx = (target_lng - self.lng) * 111_111.0 * math.cos(math.radians(self.lat))
        self.heading = (math.degrees(math.atan2(dx, dy)) + 360) % 360
        self.speed = max(self.speed, 5.0)
        self._move_forward(dt)

    def _distance_to(self, target_lat: float, target_lng: float) -> float:
        dy = (target_lat - self.lat) * 111_111.0
        dx = (target_lng - self.lng) * 111_111.0 * math.cos(math.radians(self.lat))
        return math.hypot(dx, dy)

    def _update_battery(self, dt: float) -> None:
        drain = self.cfg.battery_drain_move if self.speed > 0.1 else self.cfg.battery_drain_idle
        self.battery = max(0.0, self.battery - drain * dt)
        if self.battery < 15.0:
            self.health = "low_battery"
        else:
            self.health = "ok"

    def _telemetry_payload(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self.cfg.client_id,
            "timestamp": time.time(),
            "position": {"lat": self.lat, "lng": self.lng, "alt": self.alt},
            "speed": self.speed,
            "vertical_speed": self.vertical_speed,
            "heading": self.heading,
            "attitude": {"roll": self.roll, "pitch": self.pitch, "yaw": self.yaw},
            "battery": round(self.battery, 2),
            "signal": round(self.signal_strength, 1),
            "mode": self.mode,
            "armed": self.armed,
            "status": self.status,
            "health": self.health,
        }

    def _heartbeat_payload(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self._vehicle_id(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "connected": self.connected,
        }

    def _vehicle_id(self) -> str:
        return self.cfg.aerocommand_vehicle_id or self.cfg.client_id

    def _raw_telemetry_topic(self) -> str:
        return f"aerocommand/{self.cfg.aerocommand_org_id}/telemetry/{self._vehicle_id()}/raw"

    def _heartbeat_topic(self) -> str:
        return f"aerocommand/{self.cfg.aerocommand_org_id}/telemetry/{self._vehicle_id()}/heartbeat"

    def _command_topic(self) -> str:
        return f"aerocommand/{self.cfg.aerocommand_org_id}/command/{self._vehicle_id()}/request"

    def _aerocommand_frame(self) -> Dict[str, Any]:
        self._seq += 1
        now = datetime.now(timezone.utc)

        # Rough voltage model: keep it in a plausible range.
        voltage = 16.0 + (self.battery / 100.0) * 8.0
        current = 0.1 if not self.armed else 10.0 + (self.speed / 6.0) * 5.0
        throttle = 0.0 if not self.armed else min(100.0, 35.0 + (self.speed / 6.0) * 50.0)

        return {
            "vehicle_id": self._vehicle_id(),
            "timestamp": now.isoformat(),
            "seq": self._seq,
            "attitude": {
                "roll": self.roll,
                "pitch": self.pitch,
                "yaw": self.yaw,
            },
            "gps": {
                "lat": self.lat,
                "lng": self.lng,
                "alt": self.alt,
                "relative_alt": None,
                "fix_type": 3,
                "satellites_visible": max(0, int(10 + random.uniform(-2, 2))),
                "hdop": 0.8,
                "vdop": 1.2,
            },
            "battery": {
                "voltage": round(voltage, 2),
                "current": round(current, 2),
                "remaining": round(self.battery, 2),
                "temperature": None,
                "cell_voltages": None,
                "capacity_consumed": None,
            },
            "system": {
                "mode": self.mode,
                "armed": self.armed,
                "system_status": 4,
                "autopilot": "ardupilot",
                "vehicle_type": 2,
                "cpu_load": None,
                "errors_count": 0,
            },
            "airspeed": float(self.speed),
            "groundspeed": float(self.speed),
            "heading": float(self.heading % 360.0),
            "climb_rate": float(self.vertical_speed),
            "throttle": float(throttle),
            "rc": None,
            "wind_speed": None,
            "wind_direction": None,
        }

    def _status_payload(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self.cfg.client_id,
            "timestamp": time.time(),
            "connected": self.connected,
            "status": self.status,
            "mode": self.mode,
            "armed": self.armed,
            "health": self.health,
        }

    def start(self) -> None:
        if self.cfg.aerocommand_enabled and not self.cfg.aerocommand_org_id:
            raise SystemExit("AEROCOMMAND_ENABLED=true requires AEROCOMMAND_ORG_ID (a UUID string)")

        self.client.connect(self.cfg.mqtt_host, self.cfg.mqtt_port, keepalive=30)
        self.client.loop_start()

        def _handle_sig(*_args):
            self.running = False

        signal.signal(signal.SIGINT, _handle_sig)
        signal.signal(signal.SIGTERM, _handle_sig)

        interval = 1.0 / max(1.0, self.cfg.update_hz)
        last = time.time()

        while self.running:
            now = time.time()
            dt = max(0.001, now - last)
            last = now

            self._simulate_link(now)
            if self.connected:
                self._update_motion(dt)
                self._update_battery(dt)

                if self.cfg.aerocommand_enabled:
                    self.client.publish(self._raw_telemetry_topic(), json.dumps(self._aerocommand_frame()))
                    self.client.publish(self._heartbeat_topic(), json.dumps(self._heartbeat_payload()))
                else:
                    self.client.publish(self.cfg.telemetry_topic, json.dumps(self._telemetry_payload()))
                    self.client.publish(self.cfg.status_topic, json.dumps(self._status_payload()))

            time.sleep(interval)

        self.client.loop_stop()
        self.client.disconnect()


if __name__ == "__main__":
    sim = DroneSimulator(DroneConfig())
    sim.start()
