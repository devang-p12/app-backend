const express = require("express");
const router = express.Router();
const { checkAllGeofences } = require("../services/geofenceService");
// Assuming socketService now exports both broadcastUpdate and broadcastGeofenceUpdate
const { broadcastUpdate, broadcastGeofenceUpdate } = require("../services/socketService"); 
const { Client } = require("pg");

// Create a PostgreSQL client for the route
const con = new Client({
  user: process.env.user,
  host: process.env.host,
  database: process.env.database,
  password: process.env.password,
  port: process.env.port,
});
con.connect(err => {
  if (err) console.error("DB connection error:", err.stack);
  else console.log("Geofence route DB connected successfully");
});

// 🔥 NEW: GET ALL GEOFENCES FUNCTION (Used by WebSocket handler)
const getAllGeofences = async () => {
  const { rows } = await con.query(
    `SELECT id, name, center_lat, center_lng, radius_meters
     FROM geofences`
  );
  return rows;
};

// --- GET ALL geofences (HTTP endpoint) ---
router.get("/all", async (req, res) => {
  try {
    const geofences = await getAllGeofences();
    res.json(geofences);
  } catch (err) {
    console.error("Error fetching all geofences:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- CREATE a new geofence ---
router.post("/create", async (req, res) => {
  try {
    const { name, center_lat, center_lng, radius_meters } = req.body;
    if (!name || !center_lat || !center_lng || !radius_meters) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { rows } = await con.query(
      `INSERT INTO geofences (name, center_lat, center_lng, radius_meters)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, center_lat, center_lng, radius_meters]
    );

    const newGeofence = rows[0];
    
    // 🔥 Broadcast the new geofence to all connected clients
    broadcastGeofenceUpdate(newGeofence);

    res.json(newGeofence);
  } catch (err) {
    console.error("Create geofence error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// --- Update a geofence ---
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, center_lat, center_lng, radius_meters } = req.body;

    // Update geofence
    const { rows } = await con.query(
      `UPDATE geofences
       SET name = $1, center_lat = $2, center_lng = $3, radius_meters = $4
       WHERE id = $5
       RETURNING *`,
      [name, center_lat, center_lng, radius_meters, id]
    );

    if (!rows.length) return res.status(404).json({ error: "Geofence not found" });
    const updatedGeofence = rows[0];

    // 🔥 Broadcast the updated geofence to all connected clients
    broadcastGeofenceUpdate(updatedGeofence);
    
    // Re-check all users
    const { rows: users } = await con.query("SELECT * FROM users_locations");
    for (let user of users) {
      const geofenceStatuses = await checkAllGeofences(user.lat, user.long, con);
      const overallStatus = geofenceStatuses.some(g => g.status === "inside") ? "inside" : "outside";

      // Update user table
      await con.query(
        `UPDATE users_locations
         SET status = $1, timestamp = NOW()
         WHERE tourist_id = $2`,
        [overallStatus, user.tourist_id]
      );

      user.status = overallStatus;
      user.geofenceStatuses = geofenceStatuses;
      broadcastUpdate(user); // Broadcast user status update
    }

    res.json(updatedGeofence);
  } catch (err) {
    console.error("Update geofence error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// 🔥 Export the router AND the new getAllGeofences function
module.exports = { router, getAllGeofences };