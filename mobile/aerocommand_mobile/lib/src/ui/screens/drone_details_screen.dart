import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../realtime/realtime_controller.dart';
import '../widgets/drone_logo.dart';

class DroneDetailsScreen extends StatefulWidget {
  const DroneDetailsScreen({super.key, required this.vehicleId, this.initialName});

  final String vehicleId;
  final String? initialName;

  @override
  State<DroneDetailsScreen> createState() => _DroneDetailsScreenState();
}

class _DroneDetailsScreenState extends State<DroneDetailsScreen> {
  bool _loading = true;
  String? _error;

  Map<String, dynamic>? _vehicle;

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
      final api = context.read<ApiClient>();

      final vehicleRes = await api.getJson('/fleet/vehicles/${widget.vehicleId}');
      final vehicleMap = (vehicleRes is Map) ? vehicleRes.cast<String, dynamic>() : null;

      setState(() {
        _vehicle = vehicleMap;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _vehicle = null;
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final realtime = context.watch<RealtimeController>();
    final scheme = Theme.of(context).colorScheme;

    final t = realtime.latestTelemetry[widget.vehicleId];

    final name = _vehicle?['name']?.toString().trim();
    final title = (name != null && name.isNotEmpty) ? name : (widget.initialName ?? widget.vehicleId);

    final callsign = _vehicle?['callsign']?.toString();
    final status = _vehicle?['status']?.toString();
    final fleetId = _vehicle?['fleet_id']?.toString();
    final vehicleType = _vehicle?['type']?.toString();

    return Scaffold(
      appBar: AppBar(
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
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

                  Row(
                    children: [
                      DroneLogo(
                        size: 34,
                        color: scheme.primary,
                        rotorCount: vehicleType == 'hexacopter'
                            ? 6
                            : vehicleType == 'octocopter'
                                ? 8
                                : 4,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 2),
                            Text(
                              widget.vehicleId,
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Vehicle', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          _kv(context, 'Status', status ?? '—'),
                          _kv(context, 'Callsign', (callsign == null || callsign.isEmpty) ? '—' : callsign),
                          _kv(context, 'Fleet', (fleetId == null || fleetId.isEmpty) ? '—' : fleetId),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Realtime', style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          if (t == null)
                            Text(
                              'Waiting for telemetry…',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                            )
                          else ...[
                            _kv(context, 'Battery', '${t.batteryRemaining.toStringAsFixed(0)}%'),
                            _kv(context, 'Mode', '${t.mode} • ${t.armed ? 'armed' : 'disarmed'}'),
                            _kv(context, 'Position', '${t.lat.toStringAsFixed(5)}, ${t.lng.toStringAsFixed(5)}'),
                            _kv(context, 'Altitude', '${t.alt.toStringAsFixed(1)} m'),
                            _kv(context, 'Speed', '${t.groundspeed.toStringAsFixed(1)} m/s'),
                            _kv(context, 'Heading', '${t.heading.toStringAsFixed(0)}°'),
                            if (t.signalStrength != null) _kv(context, 'Signal', '${t.signalStrength}%'),
                            if (t.temperatureC != null) _kv(context, 'Temp', '${t.temperatureC!.toStringAsFixed(1)}°C'),
                            _kv(context, 'GPS', 'sats ${t.satellites} • fix ${t.gpsFix}'),
                            _kv(context, 'Time', t.timestamp.toLocal().toIso8601String()),
                          ],
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text('Camera', style: Theme.of(context).textTheme.titleMedium),
                              ),
                              IconButton(
                                tooltip: 'Full screen',
                                onPressed: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => const _CameraPreviewFullscreenScreen(),
                                    ),
                                  );
                                },
                                icon: const Icon(Icons.open_in_full),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          _CameraPreviewFrame(
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const _CameraPreviewFullscreenScreen(),
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
            ),
    );
  }

  Widget _kv(BuildContext context, String k, String v) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(k, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(v, style: Theme.of(context).textTheme.bodyMedium)),
        ],
      ),
    );
  }
}

class _CameraPreviewFullscreenScreen extends StatelessWidget {
  const _CameraPreviewFullscreenScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Camera'),
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: _CameraPreviewFrame(
              onTap: () {},
            ),
          ),
        ),
      ),
    );
  }
}

class _CameraPreviewFrame extends StatelessWidget {
  const _CameraPreviewFrame({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.videocam_outlined, size: 40, color: scheme.onSurfaceVariant),
                  const SizedBox(height: 10),
                  Text(
                    'Live video coming soon … once the backend streaming endpoint is implemented.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
