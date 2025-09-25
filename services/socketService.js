// services/socketService.js

let activeClients = new Set(); 

function initSocket(ws) {
    activeClients.add(ws);
    ws.on('close', () => {
        activeClients.delete(ws);
        console.log("❌ Native WebSocket client disconnected and removed from broadcast list.");
    });
    console.log(`✅ Native WebSocket client connected. Total active clients: ${activeClients.size}`);
}

function broadcastUpdate(user) {
    if (activeClients.size === 0) {
        console.log("⚠️ No active WebSocket clients to broadcast tourist update.");
        return;
    }

    const touristUpdate = {
        tourist_id: user.tourist_id,
        name: user.name,
        lat: parseFloat(user.lat),
        lng: parseFloat(user.long), 
    };

    const message = JSON.stringify({
        type: "updateTourist",
        tourist: touristUpdate,
    });

    activeClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error("Error sending update to client:", error);
            }
        }
    });

    console.log(`📡 Broadcasted update for tourist: ${user.tourist_id} to ${activeClients.size} client(s).`);
}

/**
 * Broadcasts a geofence update to all connected clients.
 * This is called from geofenceRoutes.js.
 * @param {Object} geofence The new/updated/deleted geofence object from the database.
 */
function broadcastGeofenceUpdate(geofence) {
    if (activeClients.size === 0) {
        console.log("⚠️ No active WebSocket clients to broadcast geofence update.");
        return;
    }

    let message;
    if (geofence.id) {
        // This is an update or create message
        message = JSON.stringify({
            type: "updateGeofence",
            geofence: {
                id: geofence.id,
                lat: parseFloat(geofence.center_lat),
                lng: parseFloat(geofence.center_lng),
                radius: parseFloat(geofence.radius_meters),
            },
        });
    } else if (geofence.geofenceId) {
        // This is a delete message
        message = JSON.stringify({
            type: "deleteGeofence",
            geofenceId: geofence.geofenceId,
        });
    } else {
        return;
    }

    activeClients.forEach(client => {
        if (client.readyState === client.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error("Error sending geofence update to client:", error);
            }
        }
    });

    console.log(`📡 Broadcasted geofence update to ${activeClients.size} client(s).`);
}

module.exports = { 
    initSocket, 
    broadcastUpdate,
    broadcastGeofenceUpdate 
};