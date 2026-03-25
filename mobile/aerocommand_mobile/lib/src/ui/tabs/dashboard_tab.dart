import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../models/vehicle_model.dart';
import '../../mock/demo_repository.dart';
import '../../realtime/realtime_controller.dart';
import '../screens/drone_details_screen.dart';
import '../screens/fullscreen_chart_screen.dart';
import '../widgets/drone_logo.dart';
import '../widgets/telemetry_charts.dart';

class DashboardTab extends StatefulWidget {
  const DashboardTab({super.key});

  @override
  State<DashboardTab> createState() => _DashboardTabState();
}

class _DashboardTabState extends State<DashboardTab> {
  bool _loading = true;
  String? _error;
  List<VehicleModel> _vehicles = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final realtime = context.read<RealtimeController>();
      if (realtime.isDemo) {
        final repo = DemoRepository.instance;
        repo.ensureInitialized();
        final items = repo.listVehicles().map((e) => VehicleModel.fromJson(e)).toList();
        setState(() => _vehicles = items);
        return;
      }

      final api = context.read<ApiClient>();
      final res = await api.getJson('/fleet/vehicles', query: {'page': '1', 'page_size': '200'});
      if (res is Map && res['items'] is List) {
        final items = (res['items'] as List)
            .whereType<Map>()
            .map((e) => VehicleModel.fromJson(e.cast<String, dynamic>()))
            .toList();
        setState(() => _vehicles = items);
      } else {
        setState(() => _vehicles = const []);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final realtime = context.watch<RealtimeController>();
    final scheme = Theme.of(context).colorScheme;

    final total = _vehicles.length;
    final online = _vehicles.where((v) => v.status != 'offline').length;
    final offline = total - online;
    final alerts = realtime.alerts.length;

    final recent = realtime.latestTelemetry.values.toList()
      ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
    final topRecent = recent.take(6).toList();

    final vehicleNameById = <String, String>{
      for (final v in _vehicles) v.id: v.name,
    };

    final vehicleTypeById = <String, String>{
      for (final v in _vehicles) v.id: v.type,
    };

    final batteryByName = <String, double>{};
    final signalByName = <String, double>{};
    for (final v in _vehicles) {
      final t = realtime.latestTelemetry[v.id];
      if (t == null) continue;
      batteryByName[v.name] = t.batteryRemaining.clamp(0, 100);
      if (t.signalStrength != null) {
        signalByName[v.name] = t.signalStrength!.toDouble().clamp(0, 100);
      }
    }

    final batteryItems = buildBarItems(batteryByName, maxItems: 8);
    final signalItems = buildBarItems(signalByName, maxItems: 8);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ...[
            Text(_error!, style: TextStyle(color: scheme.error)),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: _load,
                child: const Text('Retry'),
              ),
            ),
            const SizedBox(height: 12),
          ],
          Text('Dashboard', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),

          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: 'Vehicles',
                  value: '$total',
                  subtitle: '$online online / $offline offline',
                  icon: Icons.airplanemode_active_rounded,
                  iconBackground: scheme.primaryContainer,
                  iconColor: scheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  title: 'Alerts',
                  value: '$alerts',
                  subtitle: 'Latest 100 loaded',
                  icon: Icons.warning_amber_rounded,
                  iconBackground: scheme.errorContainer,
                  iconColor: scheme.onErrorContainer,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _StatCard(
            title: 'Realtime',
            value: realtime.connectionState,
            subtitle: 'Telemetry cache: ${realtime.latestTelemetry.length}',
            icon: Icons.wifi_tethering_rounded,
            iconBackground: scheme.tertiaryContainer,
            iconColor: scheme.onTertiaryContainer,
          ),
          const SizedBox(height: 16),

          Row(
            children: [
              Icon(Icons.query_stats_rounded, color: scheme.primary),
              const SizedBox(width: 8),
              Text('Charts', style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 8),
          TelemetryBarChartCard(
            title: 'Battery (top 8)',
            unit: '%',
            items: batteryItems,
            onTap: () {
              Navigator.of(context).push(
                FullscreenChartScreen.route(
                  title: 'Battery (top 8)',
                  chart: TelemetryBarChartCard(
                    title: 'Battery',
                    unit: '%',
                    items: batteryItems,
                    height: 420,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          TelemetryBarChartCard(
            title: 'Signal (top 8)',
            unit: '%',
            items: signalItems,
            onTap: () {
              Navigator.of(context).push(
                FullscreenChartScreen.route(
                  title: 'Signal (top 8)',
                  chart: TelemetryBarChartCard(
                    title: 'Signal',
                    unit: '%',
                    items: signalItems,
                    height: 420,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),

          Row(
            children: [
              Icon(Icons.radar_rounded, color: scheme.primary),
              const SizedBox(width: 8),
              Text('Recent telemetry', style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: topRecent.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text('No live telemetry yet.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                    )
                  : Column(
                      children: [
                        for (final t in topRecent)
                          ListTile(
                            leading: DroneLogo(
                              size: 24,
                              color: scheme.onSurface,
                              rotorCount: vehicleTypeById[t.vehicleId] == 'hexacopter'
                                  ? 6
                                  : vehicleTypeById[t.vehicleId] == 'octocopter'
                                      ? 8
                                      : 4,
                            ),
                            title: Text(
                              vehicleNameById[t.vehicleId] ?? t.vehicleId,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text('${t.lat.toStringAsFixed(5)}, ${t.lng.toStringAsFixed(5)} • ${t.mode}'),
                            trailing: Chip(
                              label: Text('${t.batteryRemaining.toStringAsFixed(0)}%'),
                              labelStyle: Theme.of(context).textTheme.labelMedium?.copyWith(color: scheme.onPrimaryContainer),
                              backgroundColor: scheme.primaryContainer,
                              side: BorderSide(color: scheme.primaryContainer),
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                            ),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => DroneDetailsScreen(
                                    vehicleId: t.vehicleId,
                                    initialName: vehicleNameById[t.vehicleId],
                                  ),
                                ),
                              );
                            },
                          ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.title,
    required this.value,
    required this.subtitle,
    this.icon,
    this.iconBackground,
    this.iconColor,
  });

  final String title;
  final String value;
  final String subtitle;
  final IconData? icon;
  final Color? iconBackground;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null)
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: iconBackground ?? scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, color: iconColor ?? scheme.onSurfaceVariant, size: 20),
                  ),
                if (icon != null) const SizedBox(width: 10),
                Expanded(child: Text(title, style: Theme.of(context).textTheme.labelLarge)),
              ],
            ),
            const SizedBox(height: 6),
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
