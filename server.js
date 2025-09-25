// server.js (Final and Corrected Structure)

const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const { Client } = require("pg");
const http = require("http");
const WebSocket = require("ws"); 
const cors = require("cors"); 

dotenv.config({ path: "./.env" });

const app = express();
app.use(express.static(path.join(__dirname, "./public")));
app.use(cors({
    origin: 'http://localhost:3000', 
    credentials: true
}));
app.use(express.json()); // Essential for parsing request body as JSON

// PostgreSQL connection
const con = new Client({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: process.env.port,
});

con.connect(err => {
    if (err) console.error("Error connecting to DB:", err.stack);
    else console.log("Connected to PostgreSQL!");
});

// Create HTTP server (for Express routes)
const server = http.createServer(app);

// Initialize WebSocket Server (using 'ws' package)
const wss = new WebSocket.Server({ server });

// 🔥 Import initSocket after app and wss are defined
const { initSocket } = require("./services/socketService"); 

// 🔥 Import routes and required functions (placed after essential middleware)
const { router: userRoutes, getAllTourists } = require("./routes/userRoutes.js");
const { router: geofenceRoutes, getAllGeofences } = require("./routes/geofenceRoutes.js"); 

// Apply Express Routers
app.use("/users", userRoutes); 
app.use("/geofences", geofenceRoutes);

// --- WebSocket Connection Handling ---
wss.on("connection", function connection(ws) {
    console.log("A client connected via native WebSocket");

    initSocket(ws); 

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message.toString());

            // Handle client request for all tourists
            if (data.type === "getAllTourists") {
                const tourists = await getAllTourists();
                
                ws.send(JSON.stringify({ 
                    type: "allTourists", 
                    tourists: tourists.map(t => ({
                        tourist_id: t.tourist_id, 
                        name: t.name, 
                        lat: parseFloat(t.lat), 
                        lng: parseFloat(t.long)
                    })) 
                }));
            }
            
            // Handle client request for all geofences
            if (data.type === "getAllGeofences") {
                const geofences = await getAllGeofences(); 
                
                ws.send(JSON.stringify({
                    type: "allGeofences",
                    geofences: geofences.map(g => ({
                        id: g.id.toString(),
                        name: g.name,
                        lat: parseFloat(g.center_lat),
                        lng: parseFloat(g.center_lng),
                        radius: parseFloat(g.radius_meters)
                    }))
                }));
            }
            
        } catch (e) {
            console.error("Error processing WebSocket message:", e);
        }
    });
});


// Optional: HTTP route for fetching all tourists (kept for compatibility)
app.get("/all-tourists", async (req, res) => {
    try {
        const tourists = await getAllTourists();
        res.json(tourists);
    } catch (err) {
        console.error("Error fetching tourists:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Start server
server.listen(5000, '0.0.0.0',() => console.log("Server started on port 5000"));