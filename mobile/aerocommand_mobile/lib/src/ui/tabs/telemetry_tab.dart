import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/vehicle_model.dart';
import '../../mock/demo_repository.dart';
import '../../realtime/realtime_controller.dart';
import '../../realtime/telemetry_summary.dart';
import '../screens/fullscreen_chart_screen.dart';
import '../screens/telemetry_metric_detail_screen.dart';
import '../widgets/telemetry_charts.dart';

class TelemetryTab extends StatefulWidget {
  const TelemetryTab({super.key});

  @override
  State<TelemetryTab> createState() => _TelemetryTabState();
}

class _TelemetryTabState extends State<TelemetryTab> {
  bool _loadingVehicles = true;
  List<VehicleModel> _vehicles = const [];
  String? _selectedVehicleId;
  String _vehicleQuery = '';

  TelemetryRange _range = TelemetryRange.min5;
  bool _loadingFullHistory = false;
  String? _fullHistoryError;
  List<TelemetrySummary>? _fullHistory;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadVehicles());
  }

  Future<void> _loadVehicles() async {
    setState(() => _loadingVehicles = true);
    try {
      final realtime = context.read<RealtimeController>();
      if (realtime.isDemo) {
        final repo = DemoRepository.instance;
        repo.ensureInitialized();
        final items = repo.listVehicles().map((e) => VehicleModel.fromJson(e)).toList();
        setState(() {
          _vehicles = items;
          _selectedVehicleId ??= items.isNotEmpty ? items.first.id : null;
        });
        return;
      }

      final api = context.read<ApiClient>();
      final res = await api.getJson('/fleet/vehicles', query: {'page': '1', 'page_size': '200'});
      if (res is Map && res['items'] is List) {
        final items = (res['items'] as List)
            .whereType<Map>()
            .map((e) => VehicleModel.fromJson(e.cast<String, dynamic>()))
            .toList();
        setState(() {
          _vehicles = items;
          _selectedVehicleId ??= items.isNotEmpty ? items.first.id : null;
        });
      }
    } finally {
      setState(() => _loadingVehicles = false);
    }
  }

  Future<void> _ensureFullHistory(String vehicleId) async {
    final realtime = context.read<RealtimeController>();
    if (realtime.isDemo) return;

    if (_fullHistory != null || _loadingFullHistory) return;

    setState(() {
      _loadingFullHistory = true;
      _fullHistoryError = null;
    });

    try {
      final api = context.read<ApiClient>();
      final end = DateTime.now().toUtc();
      final start = end.subtract(const Duration(minutes: 60));
      final res = await api.getJson(
        '/telemetry/vehicles/$vehicleId/history',
        query: {
          'start_time': start.toIso8601String(),
          'end_time': end.toIso8601String(),
          'resolution': '1s',
        },
      );

      final points = (res is Map && res['points'] is List) ? (res['points'] as List) : const [];
      final out = <TelemetrySummary>[];
      for (final p in points) {
        if (p is Map) {
          out.add(TelemetrySummary.fromFrameJson(vehicleId, p.cast<String, dynamic>()));
        }
      }
      out.sort((a, b) => a.timestamp.compareTo(b.timestamp));

      if (!mounted) return;
      setState(() => _fullHistory = out);
    } catch (e) {
      if (mounted) {
        setState(() => _fullHistoryError = e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loadingFullHistory = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final realtime = context.watch<RealtimeController>();
    final scheme = Theme.of(context).colorScheme;

    if (_loadingVehicles) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_vehicles.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.sensors_off, size: 44, color: scheme.onSurfaceVariant),
              const SizedBox(height: 10),
              Text('No vehicles available', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(
                'Once vehicles are registered, telemetry will appear here.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      );
    }

    final selected = _selectedVehicleId;
    final t = selected != null ? realtime.latestTelemetry[selected] : null;

    final filteredVehicles = _filteredVehicles();
    final selectedInFiltered = selected != null && filteredVehicles.any((v) => v.id == selected);
    final effectiveSelected = selectedInFiltered
      ? selected
      : (filteredVehicles.isNotEmpty ? filteredVehicles.first.id : null);

    final historyRaw = selected == null
        ? const <TelemetrySummary>[]
        : (_range == TelemetryRange.full && _fullHistory != null)
            ? _fullHistory!
            : realtime.telemetryHistory[selected] ?? const <TelemetrySummary>[];

    final history = downsample(
      filterByRange(historyRaw, _range),
      maxPoints: 700,
    );

    return RefreshIndicator(
      onRefresh: () async {
        await _loadVehicles();
        if (_selectedVehicleId != null && _range == TelemetryRange.full) {
          setState(() => _fullHistory = null);
          await _ensureFullHistory(_selectedVehicleId!);
        }
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text('Telemetry', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      labelText: 'Quick switch',
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Search by name or callsign',
                    ),
                    onChanged: (v) {
                      setState(() {
                        _vehicleQuery = v;
                        final next = _filteredVehiclesForQuery(v);
                        if (next.isNotEmpty && (_selectedVehicleId == null || !next.any((x) => x.id == _selectedVehicleId))) {
                          _selectedVehicleId = next.first.id;
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    key: ValueKey(effectiveSelected ?? 'none'),
                    initialValue: effectiveSelected,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Vehicle',
                    ),
                    items: filteredVehicles.map((v) => DropdownMenuItem(value: v.id, child: Text(v.name))).toList(),
                    onChanged: (id) async {
                      if (id == null) return;
                      setState(() => _selectedVehicleId = id);
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Realtime', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (t == null)
                    Text('Waiting for telemetry…', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant))
                  else
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _sectionHeader(context, 'Power'),
                        _kv(context, 'Battery', '${_batteryPct(t)}%'),
                        _kv(context, 'Mode', '${t.mode} • ${t.armed ? 'armed' : 'disarmed'}'),
                        if (t.signalStrength != null) _kv(context, 'Signal', '${t.signalStrength}%'),
                        if (t.temperatureC != null) _kv(context, 'Temp', '${t.temperatureC!.toStringAsFixed(1)}°C'),
                        const SizedBox(height: 10),
                        _sectionHeader(context, 'Position'),
                        _kv(context, 'Lat/Lng', '${t.lat.toStringAsFixed(5)}, ${t.lng.toStringAsFixed(5)}'),
                        _kv(context, 'Alt', '${t.alt.toStringAsFixed(1)} m'),
                        _kv(context, 'Speed', '${t.groundspeed.toStringAsFixed(1)} m/s'),
                        _kv(context, 'Heading', '${t.heading.toStringAsFixed(0)}°'),
                        const SizedBox(height: 10),
                        _sectionHeader(context, 'GPS'),
                        _kv(context, 'Fix', 'type ${t.gpsFix} • sats ${t.satellites}'),
                        _kv(context, 'Time', _formatTimestamp(t.timestamp)),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          Text('Charts', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TelemetryRangeSegmented(
                    value: _range,
                    onChanged: (r) async {
                      setState(() {
                        _range = r;
                        if (r != TelemetryRange.full) {
                          _fullHistory = null;
                          _fullHistoryError = null;
                          _loadingFullHistory = false;
                        }
                      });
                      if (r == TelemetryRange.full && selected != null) {
                        await _ensureFullHistory(selected);
                      }
                    },
                  ),
                  if (_range == TelemetryRange.full && !realtime.isDemo) ...[
                    const SizedBox(height: 10),
                    if (_loadingFullHistory)
                      Text('Loading last 60 minutes…', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant))
                    else if (_fullHistoryError != null)
                      Text('History failed: $_fullHistoryError', style: TextStyle(color: scheme.error))
                    else
                      Text('Showing last 60 minutes.', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(
                child: RadialGaugeCard(
                  title: 'Battery',
                  value01: t == null ? 0 : _battery01(t),
                  valueLabel: t == null ? '—' : '${_batteryPct(t)}%',
                  subtitle: t?.mode,
                  onTap: selected == null
                      ? null
                      : () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TelemetryMetricDetailScreen(
                                vehicleId: selected,
                                vehicleName: _vehicles.firstWhere((v) => v.id == selected).name,
                                metric: TelemetryMetric.battery,
                                initialRange: _range,
                              ),
                            ),
                          );
                        },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: RadialGaugeCard(
                  title: 'Signal',
                  value01: (t?.signalStrength ?? 0) / 100.0,
                  valueLabel: t?.signalStrength == null ? '—' : '${t!.signalStrength}%',
                  subtitle: t?.signalStrength == null ? 'n/a' : 'RSSI',
                  onTap: selected == null
                      ? null
                      : () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TelemetryMetricDetailScreen(
                                vehicleId: selected,
                                vehicleName: _vehicles.firstWhere((v) => v.id == selected).name,
                                metric: TelemetryMetric.signal,
                                initialRange: _range,
                              ),
                            ),
                          );
                        },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          TelemetryLineChartCard(
            title: 'Altitude',
            unit: TelemetryMetric.altitude.unit,
            series: buildSeries(history, (s) => s.alt),
            onTap: selected == null
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TelemetryMetricDetailScreen(
                          vehicleId: selected,
                          vehicleName: _vehicles.firstWhere((v) => v.id == selected).name,
                          metric: TelemetryMetric.altitude,
                          initialRange: _range,
                        ),
                      ),
                    );
                  },
          ),
          const SizedBox(height: 12),
          TelemetryLineChartCard(
            title: 'Speed',
            unit: TelemetryMetric.speed.unit,
            series: buildSeries(history, (s) => s.groundspeed),
            onTap: selected == null
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TelemetryMetricDetailScreen(
                          vehicleId: selected,
                          vehicleName: _vehicles.firstWhere((v) => v.id == selected).name,
                          metric: TelemetryMetric.speed,
                          initialRange: _range,
                        ),
                      ),
                    );
                  },
          ),
          const SizedBox(height: 12),
          TelemetryLineChartCard(
            title: 'Power per hour consumption',
            unit: '%/h',
            series: _buildBatteryConsumptionPerHourSeries(history),
            onTap: history.length < 2
                ? null
                : () {
                    Navigator.of(context).push(
                      FullscreenChartScreen.route(
                        title: 'Power per hour consumption',
                        chart: TelemetryLineChartCard(
                          title: 'Power per hour consumption',
                          unit: '%/h',
                          series: _buildBatteryConsumptionPerHourSeries(history),
                          height: 320,
                        ),
                      ),
                    );
                  },
          ),
          if (history.any((s) => s.temperatureC != null)) ...[
            const SizedBox(height: 12),
            TelemetryLineChartCard(
              title: 'Temperature',
              unit: TelemetryMetric.temperature.unit,
              series: buildSeries(
                history.where((s) => s.temperatureC != null).toList(growable: false),
                (s) => s.temperatureC!,
              ),
              onTap: selected == null
                  ? null
                  : () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => TelemetryMetricDetailScreen(
                            vehicleId: selected,
                            vehicleName: _vehicles.firstWhere((v) => v.id == selected).name,
                            metric: TelemetryMetric.temperature,
                            initialRange: _range,
                          ),
                        ),
                      );
                    },
            ),
          ],
        ],
      ),
    );
  }

  Widget _kv(BuildContext context, String key, String value) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 86,
            child: Text(
              key,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  List<VehicleModel> _filteredVehicles() => _filteredVehiclesForQuery(_vehicleQuery);

  List<VehicleModel> _filteredVehiclesForQuery(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return _vehicles;
    return _vehicles
        .where((v) => v.name.toLowerCase().contains(q) || v.callsign.toLowerCase().contains(q))
        .toList(growable: false);
  }

  int _batteryPct(TelemetrySummary t) {
    final raw = t.batteryRemaining;
    final pct = raw <= 1.0 ? (raw * 100.0) : raw;
    return pct.clamp(0.0, 100.0).round();
  }

  double _battery01(TelemetrySummary t) {
    return _batteryPct(t) / 100.0;
  }

  List<TelemetryPoint> _buildBatteryConsumptionPerHourSeries(List<TelemetrySummary> samples) {
    if (samples.length < 2) return const [];

    final x0 = samples.first.timestamp.millisecondsSinceEpoch.toDouble();
    final out = <TelemetryPoint>[];

    for (var i = 1; i < samples.length; i++) {
      final prev = samples[i - 1];
      final cur = samples[i];
      final dtMs = cur.timestamp.millisecondsSinceEpoch - prev.timestamp.millisecondsSinceEpoch;
      if (dtMs <= 0) continue;

      final prevPct = _batteryPct(prev).toDouble();
      final curPct = _batteryPct(cur).toDouble();

      final ratePerHour = (prevPct - curPct) / (dtMs / 3600000.0);
      final consumptionPerHour = ratePerHour < 0 ? 0.0 : ratePerHour;

      out.add(
        TelemetryPoint(
          (cur.timestamp.millisecondsSinceEpoch.toDouble() - x0) / 1000.0,
          consumptionPerHour,
        ),
      );
    }

    return out;
  }

  Widget _sectionHeader(BuildContext context, String title) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
      ),
    );
  }

  String _formatTimestamp(DateTime ts) {
    final local = ts.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    final s = local.second.toString().padLeft(2, '0');
    return '$h:$m:$s';
  }
}
