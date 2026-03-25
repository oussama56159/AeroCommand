import 'dart:math';

import '../models/alert_model.dart';

class DemoRepository {
  DemoRepository._();

  static final DemoRepository instance = DemoRepository._();

  final Random _rand = Random(7);

  final List<Map<String, dynamic>> _vehicles = [];
  final List<Map<String, dynamic>> _fleets = [];
  final List<Map<String, dynamic>> _missions = [];

  final Map<String, Map<String, dynamic>> _latestFrames = {};
  final List<AlertModel> _alerts = [];

  int _tick = 0;

  void ensureInitialized() {
    if (_vehicles.isNotEmpty) return;

    final fleetA = 'demo-fleet-a';
    final fleetB = 'demo-fleet-b';

    _fleets.addAll([
      {
        'id': fleetA,
        'name': 'Alpha Fleet',
        'description': 'Demo fleet (urban ops)',
        'vehicle_count': 3,
        'online_count': 3,
      },
      {
        'id': fleetB,
        'name': 'Bravo Fleet',
        'description': 'Demo fleet (range test)',
        'vehicle_count': 2,
        'online_count': 2,
      },
    ]);

    _vehicles.addAll([
      {
        'id': 'demo-drone-1',
        'name': 'Falcon 01',
        'callsign': 'F01',
        'type': 'quadcopter',
        'status': 'online',
        'fleet_id': fleetA,
      },
      {
        'id': 'demo-drone-2',
        'name': 'Falcon 02',
        'callsign': 'F02',
        'type': 'hexacopter',
        'status': 'in_flight',
        'fleet_id': fleetA,
      },
      {
        'id': 'demo-drone-3',
        'name': 'Falcon 03',
        'callsign': 'F03',
        'type': 'octocopter',
        'status': 'online',
        'fleet_id': fleetA,
      },
      {
        'id': 'demo-drone-4',
        'name': 'Ranger 01',
        'callsign': 'R01',
        'type': 'quadcopter',
        'status': 'in_flight',
        'fleet_id': fleetB,
      },
      {
        'id': 'demo-drone-5',
        'name': 'Ranger 02',
        'callsign': 'R02',
        'type': 'hexacopter',
        'status': 'online',
        'fleet_id': fleetB,
      },
      {
        'id': 'demo-drone-6',
        'name': 'Sentinel 01',
        'callsign': 'S01',
        'type': 'octocopter',
        'status': 'online',
        'fleet_id': fleetA,
      },
      {
        'id': 'demo-drone-7',
        'name': 'Sentinel 02',
        'callsign': 'S02',
        'type': 'quadcopter',
        'status': 'in_flight',
        'fleet_id': fleetB,
      },
      {
        'id': 'demo-drone-8',
        'name': 'Atlas 01',
        'callsign': 'A01',
        'type': 'hexacopter',
        'status': 'online',
        'fleet_id': fleetA,
      },
    ]);

    _missions.addAll([
      {
        'id': 'demo-mission-1',
        'name': 'Perimeter Patrol',
        'status': 'ready',
        'description': 'Circle a perimeter and report anomalies.',
      },
      {
        'id': 'demo-mission-2',
        'name': 'Area Scan',
        'status': 'ready',
        'description': 'Grid scan with photo capture every 10 seconds.',
      },
      {
        'id': 'demo-mission-3',
        'name': 'Return Home',
        'status': 'ready',
        'description': 'Return-to-launch sequence for safety.',
      },
    ]);

    // Start around Tunis (matches map default center)
    _seedTelemetry('demo-drone-1', lat: 36.8060, lng: 10.1820, heading: 35, speed: 4.0, alt: 35, battery: 92);
    _seedTelemetry('demo-drone-2', lat: 36.8072, lng: 10.1812, heading: 120, speed: 8.5, alt: 65, battery: 78);
    _seedTelemetry('demo-drone-3', lat: 36.8068, lng: 10.1804, heading: 240, speed: 2.5, alt: 25, battery: 88);
    _seedTelemetry('demo-drone-4', lat: 36.8058, lng: 10.1831, heading: 300, speed: 10.0, alt: 90, battery: 64);
    _seedTelemetry('demo-drone-5', lat: 36.8070, lng: 10.1840, heading: 190, speed: 1.2, alt: 18, battery: 97);
    _seedTelemetry('demo-drone-6', lat: 36.8063, lng: 10.1809, heading: 15, speed: 3.2, alt: 42, battery: 84);
    _seedTelemetry('demo-drone-7', lat: 36.8054, lng: 10.1819, heading: 265, speed: 11.5, alt: 110, battery: 58);
    _seedTelemetry('demo-drone-8', lat: 36.8076, lng: 10.1826, heading: 145, speed: 1.8, alt: 22, battery: 95);

    _pushAlert(
      vehicleId: 'demo-drone-2',
      severity: 'info',
      category: 'mission',
      title: 'Mission loaded',
      message: 'Area Scan ready to start.',
    );
  }

  List<Map<String, dynamic>> listFleets() {
    ensureInitialized();
    // Keep counts up-to-date
    for (final f in _fleets) {
      final fleetId = f['id']?.toString();
      if (fleetId == null) continue;
      final inFleet = _vehicles.where((v) => v['fleet_id']?.toString() == fleetId).toList();
      f['vehicle_count'] = inFleet.length;
      f['online_count'] = inFleet.where((v) => v['status']?.toString() != 'offline').length;
    }
    return List.unmodifiable(_fleets);
  }

  List<Map<String, dynamic>> listVehicles({String? fleetId}) {
    ensureInitialized();
    final filtered = (fleetId == null) ? _vehicles : _vehicles.where((v) => v['fleet_id']?.toString() == fleetId).toList();
    return List.unmodifiable(filtered);
  }

  Map<String, dynamic>? getVehicle(String vehicleId) {
    ensureInitialized();
    return _vehicles.cast<Map<String, dynamic>?>().firstWhere(
          (v) => v?['id']?.toString() == vehicleId,
          orElse: () => null,
        );
  }

  List<Map<String, dynamic>> listMissions() {
    ensureInitialized();
    return List.unmodifiable(_missions);
  }

  Map<String, dynamic>? getLatestSnapshot(String vehicleId) {
    ensureInitialized();
    return _latestFrames[vehicleId];
  }

  List<AlertModel> listAlerts({int limit = 100}) {
    ensureInitialized();
    return List.unmodifiable(_alerts.take(limit));
  }

  AlertModel? acknowledgeAlert(String alertId) {
    ensureInitialized();
    final idx = _alerts.indexWhere((a) => a.id == alertId);
    if (idx < 0) return null;

    final current = _alerts[idx];
    final updated = AlertModel(
      id: current.id,
      title: current.title,
      message: current.message,
      severity: current.severity,
      category: current.category,
      acknowledged: true,
      createdAt: current.createdAt,
      vehicleId: current.vehicleId,
    );
    _alerts[idx] = updated;
    return updated;
  }

  void assignMission(String missionId, List<String> vehicleIds) {
    ensureInitialized();
    _setMissionStatus(missionId, 'assigned');
    if (vehicleIds.isNotEmpty) {
      _pushAlert(
        vehicleId: vehicleIds.first,
        severity: 'info',
        category: 'mission',
        title: 'Mission assigned',
        message: 'Mission assigned to ${vehicleIds.length} vehicle(s).',
      );
    }
  }

  void uploadMission(String missionId, String vehicleId) {
    ensureInitialized();
    _setMissionStatus(missionId, 'uploaded');
    _pushAlert(
      vehicleId: vehicleId,
      severity: 'info',
      category: 'mission',
      title: 'Mission uploaded',
      message: 'Mission uploaded to vehicle.',
    );
  }

  void startMission(String missionId, String vehicleId) {
    ensureInitialized();
    _setMissionStatus(missionId, 'in_progress');
    _pushAlert(
      vehicleId: vehicleId,
      severity: 'warning',
      category: 'mission',
      title: 'Mission started',
      message: 'Vehicle started mission execution.',
    );
  }

  void tick({double dtSeconds = 0.5}) {
    ensureInitialized();
    _tick++;

    for (final v in _vehicles) {
      final id = v['id']?.toString();
      if (id == null) continue;

      final frame = _latestFrames[id];
      if (frame == null) continue;

      final pos = (frame['position'] as Map).cast<String, dynamic>();
      final system = (frame['system'] as Map).cast<String, dynamic>();
      final battery = (frame['battery'] as Map).cast<String, dynamic>();
      final gps = (frame['gps'] as Map).cast<String, dynamic>();

      var lat = (pos['lat'] as num).toDouble();
      var lng = (pos['lng'] as num).toDouble();
      var alt = (pos['alt'] as num).toDouble();

      var heading = (frame['heading'] as num).toDouble();
      var speed = (frame['groundspeed'] as num).toDouble();
      var remaining = (battery['remaining'] as num).toDouble();

      // Smooth-ish movement: small heading/speed drift.
      heading = (heading + _rand.nextDouble() * 8 - 4) % 360;
      speed = (speed + _rand.nextDouble() * 1.0 - 0.5).clamp(0.5, 14.0);

      // Convert meters to degrees (approx). 1 deg lat ~= 111_111 m.
      final meters = speed * dtSeconds;
      final rad = heading * pi / 180.0;
      final dNorth = cos(rad) * meters;
      final dEast = sin(rad) * meters;
      lat += dNorth / 111111.0;
      lng += dEast / (111111.0 * cos(lat * pi / 180.0)).clamp(0.2, double.infinity);

      // Altitude + battery.
      alt = (alt + _rand.nextDouble() * 1.6 - 0.8).clamp(10.0, 140.0);
      remaining = (remaining - (0.008 + _rand.nextDouble() * 0.01)).clamp(5.0, 100.0);

      // Status heuristics.
      final inFlight = speed > 3.0 && alt > 25;
      v['status'] = inFlight ? 'in_flight' : 'online';
      system['mode'] = inFlight ? 'AUTO' : 'HOLD';
      system['armed'] = inFlight;

      pos['lat'] = lat;
      pos['lng'] = lng;
      pos['alt'] = alt;

      frame['heading'] = heading;
      frame['groundspeed'] = speed;
      battery['remaining'] = remaining;

      // GPS.
      gps['satellites_visible'] = (10 + _rand.nextInt(9));
      gps['fix_type'] = 3;

      // Extra fields to make snapshot feel realistic.
      frame['signal_strength'] = (60 + _rand.nextInt(40)); // 60-99
      frame['temperature_c'] = (22 + _rand.nextDouble() * 8); // 22-30

      frame['timestamp'] = DateTime.now().toUtc().toIso8601String();
    }

    // Occasionally emit alerts.
    if (_tick % 10 == 0) {
      final vehicleId = _vehicles[_rand.nextInt(_vehicles.length)]['id']?.toString() ?? 'demo-drone-1';
      final latest = _latestFrames[vehicleId];
      final remaining = ((latest?['battery'] as Map?)?['remaining'] as num?)?.toDouble() ?? 50;
      if (remaining < 25 && _rand.nextBool()) {
        _pushAlert(
          vehicleId: vehicleId,
          severity: 'warning',
          category: 'battery',
          title: 'Low battery',
          message: 'Battery at ${remaining.toStringAsFixed(0)}%. Consider RTB.',
        );
      } else if (_rand.nextInt(4) == 0) {
        _pushAlert(
          vehicleId: vehicleId,
          severity: 'warning',
          category: 'geofence',
          title: 'Geofence warning',
          message: 'Vehicle approaching boundary.',
        );
      }
    }

    // Mission status lifecycles.
    if (_tick % 14 == 0) {
      final inProgress = _missions.where((m) => m['status'] == 'in_progress').toList();
      if (inProgress.isNotEmpty && _rand.nextBool()) {
        final m = inProgress[_rand.nextInt(inProgress.length)];
        m['status'] = 'completed';
        _pushAlert(
          vehicleId: _vehicles[_rand.nextInt(_vehicles.length)]['id']?.toString(),
          severity: 'info',
          category: 'mission',
          title: 'Mission completed',
          message: '${m['name']} completed successfully.',
        );
      }
    }
  }

  void _setMissionStatus(String missionId, String status) {
    final idx = _missions.indexWhere((m) => m['id']?.toString() == missionId);
    if (idx < 0) return;
    _missions[idx]['status'] = status;
  }

  void _seedTelemetry(
    String vehicleId, {
    required double lat,
    required double lng,
    required double heading,
    required double speed,
    required double alt,
    required double battery,
  }) {
    _latestFrames[vehicleId] = {
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'position': {
        'lat': lat,
        'lng': lng,
        'alt': alt,
      },
      'gps': {
        'lat': lat,
        'lng': lng,
        'alt': alt,
        'satellites_visible': 14,
        'fix_type': 3,
      },
      'battery': {
        'remaining': battery,
      },
      'system': {
        'mode': speed > 3.0 ? 'AUTO' : 'HOLD',
        'armed': speed > 3.0,
      },
      'groundspeed': speed,
      'heading': heading,
      'signal_strength': 88,
      'temperature_c': 26.2,
    };
  }

  void _pushAlert({
    required String? vehicleId,
    required String severity,
    required String category,
    required String title,
    required String message,
  }) {
    final alert = AlertModel(
      id: 'demo-alert-${DateTime.now().millisecondsSinceEpoch}',
      title: title,
      message: message,
      severity: severity,
      category: category,
      acknowledged: false,
      createdAt: DateTime.now().toUtc(),
      vehicleId: vehicleId,
    );
    _alerts.insert(0, alert);
    if (_alerts.length > 200) {
      _alerts.removeRange(200, _alerts.length);
    }
  }
}
