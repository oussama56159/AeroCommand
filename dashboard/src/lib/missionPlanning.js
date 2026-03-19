const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function toLocalMeters(point, refLat, refLng) {
  const lat = Number(point?.lat) || 0;
  const lng = Number(point?.lng) || 0;
  const x = toRad(lng - refLng) * EARTH_RADIUS_M * Math.cos(toRad(refLat));
  const y = toRad(lat - refLat) * EARTH_RADIUS_M;
  return { x, y };
}

export function toLatLng(point, refLat, refLng) {
  const lat = refLat + toDeg(point.y / EARTH_RADIUS_M);
  const lng = refLng + toDeg(point.x / (EARTH_RADIUS_M * Math.cos(toRad(refLat))));
  return { lat, lng };
}

export function distanceMeters(a, b) {
  const lat1 = toRad(Number(a?.lat) || 0);
  const lat2 = toRad(Number(b?.lat) || 0);
  const dLat = lat2 - lat1;
  const dLng = toRad((Number(b?.lng) || 0) - (Number(a?.lng) || 0));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rotateXY(point, angleDeg) {
  const a = toRad(angleDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: point.x * c - point.y * s,
    y: point.x * s + point.y * c,
  };
}

export function isPointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const x = Number(point?.lng);
  const y = Number(point?.lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i]?.lng);
    const yi = Number(polygon[i]?.lat);
    const xj = Number(polygon[j]?.lng);
    const yj = Number(polygon[j]?.lat);

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistanceMeters(point, a, b, refLat, refLng) {
  const p = toLocalMeters(point, refLat, refLng);
  const pa = toLocalMeters(a, refLat, refLng);
  const pb = toLocalMeters(b, refLat, refLng);
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - pa.x, p.y - pa.y);
  const t = Math.max(0, Math.min(1, ((p.x - pa.x) * dx + (p.y - pa.y) * dy) / len2));
  const projX = pa.x + t * dx;
  const projY = pa.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function isInsideWithMargin(point, polygon, edgeMarginM) {
  if (!isPointInPolygon(point, polygon)) return false;
  if (!edgeMarginM || edgeMarginM <= 0) return true;
  const refLat = Number(polygon[0]?.lat) || 0;
  const refLng = Number(polygon[0]?.lng) || 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = pointToSegmentDistanceMeters(point, a, b, refLat, refLng);
    if (d < edgeMarginM) return false;
  }
  return true;
}

export function validateMissionAgainstGeofence(waypoints, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return { valid: false, reasons: ['Geofence polygon is missing or has fewer than 3 vertices.'] };
  }
  if (!Array.isArray(waypoints) || waypoints.length === 0) {
    return { valid: false, reasons: ['Mission has no waypoints.'] };
  }

  const reasons = [];
  waypoints.forEach((wp, i) => {
    if (!isPointInPolygon({ lat: wp.lat, lng: wp.lng }, polygon)) {
      reasons.push(`Waypoint #${i + 1} is outside geofence (${Number(wp.lat).toFixed(6)}, ${Number(wp.lng).toFixed(6)}).`);
    }
  });

  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let s = 1; s < 10; s += 1) {
      const t = s / 10;
      const p = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
      if (!isPointInPolygon(p, polygon)) {
        reasons.push(`Path segment #${i + 1} exits geofence near ${Math.round(t * 100)}% between waypoints #${i + 1} and #${i + 2}.`);
        break;
      }
    }
  }

  return { valid: reasons.length === 0, reasons };
}

export function computeMissionDistanceMeters(waypoints, dronePosition) {
  if (!Array.isArray(waypoints) || waypoints.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    total += distanceMeters(waypoints[i], waypoints[i + 1]);
  }

  if (dronePosition?.lat && dronePosition?.lng) {
    total += distanceMeters(dronePosition, waypoints[0]);
  }

  if (waypoints.length > 1) {
    total += distanceMeters(waypoints[waypoints.length - 1], waypoints[0]);
  }

  return total;
}

export function estimateBatteryThresholdPercent(distanceMetersValue) {
  const km = Math.max(0, distanceMetersValue / 1000);
  const missionConsumption = km * 6;
  const rtlAndReserve = 15;
  return Math.min(95, Math.ceil(missionConsumption + rtlAndReserve));
}

export function generateGridWaypoints(polygon, options = {}) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [];
  const lineSpacing = Math.max(1, Number(options.lineSpacing) || 20);
  const heading = Number(options.headingAngle) || 0;
  const overlap = Math.max(0, Math.min(90, Number(options.overlapPercent) || 0));
  const edgeMargin = Math.max(0, Number(options.edgeMargin) || 0);
  const turnaround = options.turnaround || 'inside_only';
  const altitude = Math.max(5, Number(options.altitude) || 100);
  const altitudeMode = options.altitudeMode || 'relative';

  const effectiveSpacing = Math.max(1, lineSpacing * (1 - overlap / 100));

  const refLat = Number(polygon[0].lat);
  const refLng = Number(polygon[0].lng);
  const localPoly = polygon.map((p) => rotateXY(toLocalMeters(p, refLat, refLng), -heading));

  const xs = localPoly.map((p) => p.x);
  const ys = localPoly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const points = [];
  let reverse = false;

  for (let y = minY + edgeMargin; y <= maxY - edgeMargin; y += effectiveSpacing) {
    const insideXs = [];
    const sampleStep = Math.max(1, effectiveSpacing / 4);

    for (let x = minX; x <= maxX; x += sampleStep) {
      const world = rotateXY({ x, y }, heading);
      const ll = toLatLng(world, refLat, refLng);
      if (isInsideWithMargin(ll, polygon, edgeMargin)) insideXs.push(x);
    }

    if (insideXs.length < 2) continue;

    const startX = Math.min(...insideXs);
    const endX = Math.max(...insideXs);

    const a = rotateXY({ x: reverse ? endX : startX, y }, heading);
    const b = rotateXY({ x: reverse ? startX : endX, y }, heading);

    const pa = toLatLng(a, refLat, refLng);
    const pb = toLatLng(b, refLat, refLng);

    points.push({ lat: pa.lat, lng: pa.lng, alt: altitude, altitude_mode: altitudeMode, command: 'NAV_WAYPOINT' });

    if (turnaround === 'edge_pause') {
      points.push({ lat: pa.lat, lng: pa.lng, alt: altitude, altitude_mode: altitudeMode, command: 'NAV_LOITER_TIME' });
    }

    points.push({ lat: pb.lat, lng: pb.lng, alt: altitude, altitude_mode: altitudeMode, command: 'NAV_WAYPOINT' });

    if (turnaround === 'edge_pause') {
      points.push({ lat: pb.lat, lng: pb.lng, alt: altitude, altitude_mode: altitudeMode, command: 'NAV_LOITER_TIME' });
    }

    reverse = !reverse;
  }

  return points;
}
