import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'drone_logo.dart';
import 'drone_map_styles.dart';

class DroneMarkerViewModel {
  DroneMarkerViewModel({
    required this.vehicleId,
    required this.name,
    required this.vehicleType,
    required this.state,
    required this.headingDeg,
    this.altMeters,
    this.speedMps,
  });

  final String vehicleId;
  final String name;
  final String vehicleType;
  final DroneOperationalState state;
  final double headingDeg;
  final double? altMeters;
  final double? speedMps;

  int get rotorCount {
    switch (vehicleType) {
      case 'hexacopter':
        return 6;
      case 'octocopter':
        return 8;
      case 'quadcopter':
      default:
        return 4;
    }
  }

  String get semanticsLabel => 'Drone $name — ${DroneMapStyle.stateLabel(state)}';

  String infoLine() {
    final parts = <String>[DroneMapStyle.stateLabel(state)];

    if (altMeters != null) {
      parts.add('Alt ${altMeters!.toStringAsFixed(0)}m');
    }
    if (speedMps != null) {
      parts.add('Spd ${speedMps!.toStringAsFixed(1)}m/s');
    }

    return parts.join(' • ');
  }

  String tooltipText({bool includeOptional = true}) {
    final base = '$name\nState: ${DroneMapStyle.stateLabel(state)}';
    if (!includeOptional) return base;

    final parts = <String>[];
    if (altMeters != null) parts.add('Alt: ${altMeters!.toStringAsFixed(0)} m');
    if (speedMps != null) parts.add('Speed: ${speedMps!.toStringAsFixed(1)} m/s');

    if (parts.isEmpty) return base;
    return '$base\n${parts.join(' • ')}';
  }
}

class DroneMapMarker extends StatefulWidget {
  const DroneMapMarker({
    super.key,
    required this.vm,
    required this.selected,
    required this.showLabel,
    required this.onTap,
  });

  final DroneMarkerViewModel vm;
  final bool selected;
  final bool showLabel;
  final VoidCallback onTap;

  @override
  State<DroneMapMarker> createState() => _DroneMapMarkerState();
}

class _DroneMapMarkerState extends State<DroneMapMarker> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isTouchPlatform = !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

    final shouldHighlight = widget.selected || _hovered || _focused;
    final fill = DroneMapStyle.stateColor(widget.vm.state);

    final outline = scheme.onSurface.withValues(alpha: shouldHighlight ? 0.55 : 0.32);
    final shadowColor = Theme.of(context).shadowColor.withValues(alpha: shouldHighlight ? 0.45 : 0.30);

    final marker = AnimatedScale(
      duration: const Duration(milliseconds: 140),
      scale: shouldHighlight ? 1.12 : 1.0,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        width: DroneMapStyle.markerSize,
        height: DroneMapStyle.markerSize,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(color: outline, width: DroneMapStyle.markerOutlineWidth),
          boxShadow: [
            BoxShadow(
              color: shadowColor,
              blurRadius: shouldHighlight ? 10 : 7,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Center(
          child: Transform.rotate(
            angle: widget.vm.headingDeg * math.pi / 180,
            child: DroneLogo(
              size: 15,
              color: scheme.surface,
              rotorCount: widget.vm.rotorCount,
            ),
          ),
        ),
      ),
    );

    final label = _DroneNameLabel(
      name: widget.vm.name,
      highlighted: shouldHighlight,
      rotorCount: widget.vm.rotorCount,
    );

    // Width must include room for the label, while keeping the marker centered at the GPS point.
    final markerWidth = widget.showLabel ? 220.0 : DroneMapStyle.markerSize;
    final centerX = markerWidth / 2;

    final showInfo = widget.selected || _hovered || _focused;
    final info = _DroneInfoBubble(
      title: widget.vm.name,
      subtitle: widget.vm.infoLine(),
      highlighted: shouldHighlight,
      rotorCount: widget.vm.rotorCount,
    );

    final child = SizedBox(
      width: markerWidth,
      height: 60,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (showInfo)
            Positioned(
              left: centerX - (_DroneInfoBubble.width / 2),
              top: 0,
              child: info,
            ),
          Positioned(
            left: centerX - (DroneMapStyle.markerSize / 2),
            top: 28,
            child: marker,
          ),
          if (widget.showLabel)
            Positioned(
              left: centerX + (DroneMapStyle.markerSize / 2) + 8,
              top: 28 + (DroneMapStyle.markerSize - _DroneNameLabel.height) / 2,
              child: label,
            ),
        ],
      ),
    );

    return Semantics(
      label: widget.vm.semanticsLabel,
      button: true,
      focusable: true,
      child: FocusableActionDetector(
        onShowHoverHighlight: (v) {
          if (isTouchPlatform) return;
          setState(() => _hovered = v);
        },
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        mouseCursor: SystemMouseCursors.click,
        actions: <Type, Action<Intent>>{
          ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) {
            widget.onTap();
            return null;
          }),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: child,
        ),
      ),
    );
  }
}

class _DroneInfoBubble extends StatelessWidget {
  const _DroneInfoBubble({
    required this.title,
    required this.subtitle,
    required this.highlighted,
    required this.rotorCount,
  });

  static const double width = 170;
  static const double height = 26;

  final String title;
  final String subtitle;
  final bool highlighted;
  final int rotorCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = scheme.surface.withValues(alpha: highlighted ? 0.97 : 0.92);
    final border = scheme.outlineVariant.withValues(alpha: highlighted ? 0.75 : 0.55);

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 120),
      opacity: 1,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border, width: 1),
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).shadowColor.withValues(alpha: 0.22),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: SizedBox(
          width: width,
          height: height,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              children: [
                DroneLogo(size: 14, color: scheme.onSurface, rotorCount: rotorCount),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: scheme.onSurface,
                        ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.right,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DroneNameLabel extends StatelessWidget {
  const _DroneNameLabel({
    required this.name,
    required this.highlighted,
    required this.rotorCount,
  });

  static const double height = 26;

  final String name;
  final bool highlighted;
  final int rotorCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    final bg = scheme.surface.withValues(alpha: highlighted ? 0.96 : 0.88);
    final border = scheme.outlineVariant.withValues(alpha: highlighted ? 0.70 : 0.55);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 150, minHeight: height),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border, width: 1),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DroneLogo(size: 16, color: scheme.onSurface, rotorCount: rotorCount),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: scheme.onSurface,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DroneStateLegend extends StatelessWidget {
  const DroneStateLegend({
    super.key,
    required this.collapsed,
    required this.onToggleCollapsed,
  });

  final bool collapsed;
  final VoidCallback onToggleCollapsed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      container: true,
      label: 'Drone state legend',
      explicitChildNodes: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.surface.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.55)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            children: [
              Text(
                'Legend',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(width: 6),
              IconButton(
                tooltip: collapsed ? 'Expand legend' : 'Collapse legend',
                onPressed: onToggleCollapsed,
                icon: Icon(collapsed ? Icons.expand_more : Icons.expand_less),
              ),
              if (!collapsed) ...[
                const SizedBox(width: 8),
                const Expanded(child: _LegendItems()),
              ] else
                const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}

class _LegendItems extends StatelessWidget {
  const _LegendItems();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: const [
          _LegendItem(state: DroneOperationalState.armed, description: 'Motors armed'),
          SizedBox(width: 12),
          _LegendItem(state: DroneOperationalState.disarmed, description: 'Motors off'),
          SizedBox(width: 12),
          _LegendItem(state: DroneOperationalState.inflight, description: 'Airborne'),
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({
    required this.state,
    required this.description,
  });

  final DroneOperationalState state;
  final String description;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = DroneMapStyle.stateLabel(state);

    return Focus(
      canRequestFocus: true,
      child: Semantics(
        focusable: true,
        label: '$label. $description.',
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                color: DroneMapStyle.stateColor(state),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: scheme.onSurface.withValues(alpha: 0.22)),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ],
        ),
      ),
    );
  }
}
