from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Callable, Iterable

from pymavlink import mavutil


@dataclass
class MavlinkMessage:
    name: str
    data: dict
    timestamp: float


class MavlinkReader:
    def __init__(self, connection: str, baud: int, source_system: int = 255) -> None:
        self.connection = connection
        self.baud = baud
        self.source_system = source_system
        self._master: mavutil.mavfile | None = None
        self._waiters: dict[str, list[tuple[Callable[[dict], bool], asyncio.Future[MavlinkMessage]]]] = {}

    def connect(self) -> None:
        self._master = mavutil.mavlink_connection(
            self.connection,
            baud=self.baud,
            source_system=self.source_system,
            autoreconnect=True,
        )

        # Wait for heartbeat so we know the link is alive.
        self._master.wait_heartbeat(timeout=30)

    @property
    def master(self) -> mavutil.mavfile:
        if self._master is None:
            raise RuntimeError("MavlinkReader not connected")
        return self._master

    def notify(self, msg: MavlinkMessage) -> None:
        waiters = self._waiters.get(msg.name)
        if not waiters:
            return

        remaining: list[tuple[Callable[[dict], bool], asyncio.Future[MavlinkMessage]]] = []
        for predicate, fut in waiters:
            if fut.done():
                continue
            try:
                ok = predicate(msg.data)
            except Exception:
                ok = False
            if ok:
                fut.set_result(msg)
            else:
                remaining.append((predicate, fut))

        if remaining:
            self._waiters[msg.name] = remaining
        else:
            self._waiters.pop(msg.name, None)

    async def wait_for(
        self,
        names: str | Iterable[str],
        *,
        predicate: Callable[[dict], bool] | None = None,
        timeout_s: float = 10.0,
    ) -> MavlinkMessage:
        if isinstance(names, str):
            name_list = [names]
        else:
            name_list = list(names)

        loop = asyncio.get_running_loop()
        fut: asyncio.Future[MavlinkMessage] = loop.create_future()
        pred = predicate or (lambda _d: True)

        for name in name_list:
            self._waiters.setdefault(name, []).append((pred, fut))

        try:
            return await asyncio.wait_for(fut, timeout=timeout_s)
        finally:
            # Best-effort cleanup so we don't leak waiters.
            for name in name_list:
                entries = self._waiters.get(name)
                if not entries:
                    continue
                self._waiters[name] = [(p, f) for (p, f) in entries if f is not fut]
                if not self._waiters[name]:
                    self._waiters.pop(name, None)

    def recv(self, timeout: float = 1.0) -> MavlinkMessage | None:
        if self._master is None:
            raise RuntimeError("MavlinkReader not connected")

        msg = self._master.recv_match(blocking=True, timeout=timeout)
        if msg is None:
            return None

        try:
            data = msg.to_dict()
        except Exception:
            data = {}

        return MavlinkMessage(name=msg.get_type(), data=data, timestamp=time.time())
