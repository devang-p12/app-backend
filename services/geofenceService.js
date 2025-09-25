// services/geofenceService.js
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  // Returns distance in meters between two coordinates
  const toRad = (deg) => deg * (Math.PI / 180);
  const R = 6371000; // Earth radius in meters

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
};

// con is your PostgreSQL client
const checkAllGeofences = async (lat, lng, con) => {
  try {
    const { rows: geofences } = await con.query(
      `SELECT id, name, center_lat, center_lng, radius_meters FROM geofences`
    );

    // Check which geofences the point is inside
    const results = geofences.map((g) => {
      const distance = haversineDistance(lat, lng, g.center_lat, g.center_lng);
      return {
        geofenceId: g.id,
        name: g.name,
        status: distance <= g.radius_meters ? "inside" : "outside",
        distance: distance.toFixed(2), // optional, in meters
      };
    });

    return results;
  } catch (err) {
    console.error("Geofence check error:", err);
    return [];
  }
};

module.exports = { checkAllGeofences };
