class VehicleModel {
  VehicleModel({
    required this.id,
    required this.name,
    required this.callsign,
    required this.type,
    required this.status,
    required this.fleetId,
  });

  final String id;
  final String name;
  final String callsign;
  final String type;
  final String status;
  final String? fleetId;

  factory VehicleModel.fromJson(Map<String, dynamic> json) {
    return VehicleModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      callsign: json['callsign']?.toString() ?? '',
      type: json['type']?.toString() ?? 'quadcopter',
      status: json['status']?.toString() ?? 'offline',
      fleetId: json['fleet_id']?.toString(),
    );
  }
}
