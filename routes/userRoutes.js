const { Client } = require("pg");
const express = require("express");
const router = express.Router();
const { checkAllGeofences } = require("../services/geofenceService");
const { broadcastUpdate } = require("../services/socketService");

// PostgreSQL connection
const con = new Client({
  user: process.env.user,
  host: process.env.host,
  database: process.env.database,
  password: process.env.password,
  port: process.env.port,
});
con.connect(err => {
  if (err) console.error("DB connection error:", err.stack);
  else console.log("DB connected successfully");
});

// --- CREATE a new tourist ---
router.post("/create", async (req, res) => {
  try {
    // 🔥 ADDED 'token' field to destructuring
    const { tourist_id, name, lat, long, token } = req.body; 

    if (!tourist_id || !lat || !long) {
      return res.status(400).json({ error: "tourist_id, lat, and long are required" });
    }

    // 🔥 MODIFIED QUERY to include the new 'token' column
    const { rows } = await con.query(
      `INSERT INTO users_locations 
      (tourist_id, name, lat, long, geo_fence_violations, status, token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tourist_id, name || null, lat, long, [], "outside", token || null] // $7 is for token
    );

    res.json(rows[0]);

  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- UPDATE tourist location ---
router.post("/update-location", async (req, res) => {
  try {
    console.log("Received body:", req.body);
    const { tourist_id, lat, long } = req.body;

    if (!tourist_id || lat === undefined || long === undefined)
      return res.status(400).json({ error: "Missing required fields" });

    // Check geofences
    const geofenceStatuses = await checkAllGeofences(lat, long, con);
    const insideGeofences = geofenceStatuses
      .filter(g => g.status === "inside")
      .map(g => g.geofenceId);

    const status = insideGeofences.length > 0 ? "inside" : "outside";

    // Update only lat, long, status, timestamp
    // NOTE: ON CONFLICT on (tourist_id) handles update without affecting the 'token' field.
    const { rows } = await con.query(
      `INSERT INTO users_locations (tourist_id, lat, long, status, timestamp)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tourist_id) DO UPDATE
       SET lat = EXCLUDED.lat,
           long = EXCLUDED.long,
           status = EXCLUDED.status,
           timestamp = NOW()
       RETURNING tourist_id, lat, long`,
      [tourist_id, lat, long, status]
    );
    console.log("DB update result:", rows);
    if (rows.length === 0)
      return res.status(404).json({ error: "Tourist not found" });
    const user = rows[0];

    // Broadcast minimal update via websocket
    broadcastUpdate(user);

    // Respond with only tourist_id, lat, lng
    res.json({
      tourist_id: user.tourist_id,
      lat: parseFloat(user.lat),
      lng: parseFloat(user.long),
    });

  } catch (err) {
    console.error("Update-location error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// --- GET ALL tourists (HTTP endpoint) ---
// 🔥 MODIFIED: Include 'token' in the SELECT query
router.get("/all", async (req, res) => {
  try {
    const { rows } = await con.query(
      `SELECT tourist_id, name, lat, long, geo_fence_violations, status, token
       FROM users_locations`
    );
    res.json(rows);
  } catch (err) {
    console.error("Error fetching all tourists:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- GET ALL tourists (function for socket usage) ---
// 🔥 MODIFIED: Include 'token' in the SELECT query
const getAllTourists = async () => {
  const { rows } = await con.query(
    `SELECT tourist_id, name, lat, long, geo_fence_violations, status, token
     FROM users_locations`
  );
  return rows;
};

// --- UPDATE SOS SIGNAL ---
router.post("/sos", async (req, res) => {
  try {
    const { tourist_id, sos_signal } = req.body;

    // Validate inputs
    if (!tourist_id || (sos_signal !== 0 && sos_signal !== 1)) {
      return res.status(400).json({ error: "Invalid tourist_id or sos_signal" });
    }

    // 1. Update the SOS signal in the database
    await con.query(
      `UPDATE users_locations
       SET sos_signal = $1, sos_timestamp = NOW()
       WHERE tourist_id = $2`,
      [sos_signal, tourist_id]
    );

    // 2. Fetch the updated user data to broadcast (including lat, long, name, etc.)
    // 🔥 MODIFIED: Include 'token' in the SELECT query
    const { rows } = await con.query(
        `SELECT tourist_id, name, lat, long, status, sos_signal, sos_timestamp, token
         FROM users_locations
         WHERE tourist_id = $1`,
        [tourist_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Tourist not found" });
    }

    const updatedUser = rows[0];
    
    // CRITICAL FIX: Broadcast the full user object update
    broadcastUpdate(updatedUser);

    // Respond with minimal info (or the full user object)
    res.json({
        tourist_id: updatedUser.tourist_id, 
        sos_signal: updatedUser.sos_signal, 
        sos_timestamp: updatedUser.sos_timestamp
    });

  } catch (err) {
    console.error("Update SOS error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = { router, getAllTourists };