 const users = []; // {id, name, lat, lng, status, timestamp}
let geofence = {
  id: 1,
  name: "Tourist Spot A",
  centerLat: 27.56639,
  centerLng: 93.83139,
  radiusMeters: 500
};

module.exports = { users, geofence };