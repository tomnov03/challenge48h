const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 8080;

let cachedGTFSData = null;
let cachedPhysicalStops = null;
let cachedRealTime = null;
let cachedMetroStations = null;
let lastUpdated = null;

// 📂 Servir les fichiers statiques (frontend)
app.use(express.static(path.join(__dirname, "../frontend")));
app.use('/static', express.static(path.join(__dirname, '../frontend/static')));


// 📌 Fonction générique pour charger les fichiers JSON
function loadJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.error(`❌ Erreur lors du chargement de ${filePath} :`, err);
        return null;
    }
}

// 📌 Exécuter GTFS.py pour récupérer les données en temps réel
function fetchGTFSData() {
    const scriptPath = path.join(__dirname, "GTFS.py");
    exec(`python ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erreur exécution GTFS.py : ${error.message}`);
            cachedGTFSData = { error: "Erreur exécution script." };
            return;
        }
        if (stderr) {
            console.error(`⚠️ Erreur dans GTFS.py : ${stderr}`);
        }
        try {
            cachedGTFSData = JSON.parse(stdout);
            lastUpdated = new Date();
        } catch (err) {
            console.error("❌ Erreur parsing JSON :", err);
            cachedGTFSData = { error: "Erreur parsing GTFS." };
        }
    });
}

// 📂 Charger les fichiers JSON (statiques)
function fetchStaticData() {
  cachedPhysicalStops = loadJSON(path.join(__dirname, "physical_stop.json"));
  cachedRealTime = loadJSON(path.join(__dirname, "prochains_passages.json"));
  cachedMetroStations = loadJSON(path.join(__dirname, "stations_metro.json"));
  

    if (cachedMetroStations) {
        cachedMetroStations = cachedMetroStations.features.map((station) => ({
            nom_statio: station.properties.nom_statio,
            commune: station.properties.commune,
            ligne: station.properties.ligne,
            coordinates: station.geometry.coordinates,
        }));
        console.log("✅ Stations de métro chargées !");
    } else {
        console.error("❌ Erreur chargement des stations de métro.");
    }
}

// 🔄 Mise à jour automatique toutes les 30 secondes
function updateData() {
    fetchGTFSData();
    fetchStaticData();
}
updateData();
setInterval(updateData, 30000);

// 📌 API pour récupérer les arrêts fusionnés avec le numéro de ligne
app.get("/api/matched_stops", (req, res) => {
    if (!cachedGTFSData || !cachedPhysicalStops || !cachedRealTime) {
        return res.status(503).json({ error: "Données en cours de récupération." });
    }

    let matchedStops = [];

    cachedGTFSData.trips.forEach(trip => {
        trip.stops.forEach(tripStop => {
            const physicalStop = cachedPhysicalStops.features.find(
                stop => stop.properties.code_arret_physique === tripStop.stop_id
            );

            const realTimeStop = cachedRealTime.records.find(
                record => record.identifiant_station.includes(tripStop.stop_id)
            );

            let codeLigne = "Non disponible";
            if (physicalStop) {
                codeLigne = physicalStop.properties.code_ligne || "Non disponible";
            } else if (realTimeStop) {
                codeLigne = realTimeStop.code_ligne || "Non disponible";
            }

            if (physicalStop || realTimeStop) {
                matchedStops.push({
                    stop_id: tripStop.stop_id,
                    stop_name: tripStop.stop_name,
                    stop_desc: tripStop.stop_desc,
                    geom: tripStop.geom,
                    arrival_time: tripStop.arrival_time,
                    departure_time: tripStop.departure_time,

                    // 🔥 Données des arrêts physiques
                    code_arret_physique: physicalStop ? physicalStop.properties.code_arret_physique : "Non trouvé",
                    nom_commercial_arret: physicalStop ? physicalStop.properties.nom_commercial_arret : "Non trouvé",
                    adresse: physicalStop ? `${physicalStop.properties.rue}, ${physicalStop.properties.commune}` : "Non disponible",
                    coordonnees: physicalStop ? physicalStop.geometry.coordinates : "Non disponible",
                    type_voirie: physicalStop ? physicalStop.properties.type_voirie : "Non disponible",
                    code_postal: physicalStop ? physicalStop.properties.code_postal : "Non disponible",
                    code_insee: physicalStop ? physicalStop.properties.code_insee : "Non disponible",

                    // 🔥 Données des passages en temps réel
                    identifiant_station: realTimeStop ? realTimeStop.identifiant_station : "Non trouvé",
                    nom_station: realTimeStop ? realTimeStop.nom_station : "Non trouvé",
                    code_ligne: codeLigne,
                    sens_ligne: realTimeStop ? realTimeStop.sens_ligne : "Non disponible",
                    heure_estimee_depart: realTimeStop ? realTimeStop.heure_estimee_depart : "Non disponible",
                    date_modification: realTimeStop ? realTimeStop.date_modification : "Non disponible"
                });
            }
        });
    });

    res.json({ lastUpdated, matchedStops });
});

// 📌 API pour récupérer les données GTFS
app.get("/api/gtfs", (req, res) => {
    if (!cachedGTFSData) {
        return res.status(503).json({ error: "Données en cours de récupération." });
    }
    res.json({ lastUpdated, data: cachedGTFSData });
});

// 📌 API pour récupérer les stations de métro
app.get("/api/stations_metro", (req, res) => {
    if (!cachedMetroStations) {
        return res.status(503).json({ error: "Données en cours de chargement." });
    }
    res.json(cachedMetroStations);
});

// 📌 Charger les données des vélos en libre-service (V'Lille)
let cachedVlilleData = null;

function fetchVlilleData() {
  const vlillePath = path.join(__dirname, "vlille_temps_reel.json");
    cachedVlilleData = loadJSON(vlillePath);

    if (!cachedVlilleData) {
        console.error("❌ Erreur chargement des données V'Lille.");
    } else {
        console.log("✅ Données V'Lille chargées !");
    }
}

// Met à jour les données V'Lille toutes les 30 secondes
fetchVlilleData();
setInterval(fetchVlilleData, 30000);

// 📌 API pour récupérer les données V'Lille
app.get("/api/vlille", (req, res) => {
    if (!cachedVlilleData) {
        return res.status(503).json({ error: "Données V'Lille en cours de récupération." });
    }
    res.json(cachedVlilleData);
});

// 📌 Charger les données des parkings en libre-service 
let cachedParkingData = null;

function fetchParkingData() {
  const parkingPath = path.join(__dirname, "parking.json");
  cachedParkingData = loadJSON(parkingPath);

    if (!cachedParkingData) {
        console.error("❌ Erreur chargement des données.");
    } else {
    }
}

// Met à jour les données parking toutes les 30 secondes
fetchParkingData();
setInterval(fetchParkingData, 30000);

// 📌 API pour récupérer les données parking
app.get("/api/parking", (req, res) => {
    if (!cachedParkingData) {
        return res.status(503).json({ error: "Données en cours de récupération." });
    }
    res.json(cachedParkingData);
});


// 📌 Charger les données des réseaux sociaux des villes
let cachedReseauxSociaux = null;

function fetchReseauxSociaux() {
    const reseauxPath = path.join(__dirname, "../backend/reseaux_sociaux.json"); // Chemin du fichier JSON
    cachedReseauxSociaux = loadJSON(reseauxPath);

    if (!cachedReseauxSociaux) {
        console.error("❌ Erreur chargement des données des réseaux sociaux.");
    } else {
        console.log("✅ Données des réseaux sociaux chargées !");
    }
}

// Met à jour les données toutes les 30 secondes
fetchReseauxSociaux();
setInterval(fetchReseauxSociaux, 30000);

// 📌 API pour récupérer les données des réseaux sociaux
app.get("/api/reseaux_sociaux", (req, res) => {
    if (!cachedReseauxSociaux) {
        return res.status(503).json({ error: "Données en cours de récupération." });
    }
    res.json(cachedReseauxSociaux);
});


// 📌 Routes pour servir les pages HTML
const pages = [
  "index", "article1", "article2", "article3",
  "ligne1", "ligne2", "bus", "vlille", "parkings", "contact"
];

pages.forEach(page => {
    app.get(`/${page}.html`, (req, res) => {
        res.sendFile(path.join(__dirname, `../frontend/templates/${page}.html`));
    });
});

// 🌍 Route principale -> index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/templates/index.html"));
});

// 🚀 Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
