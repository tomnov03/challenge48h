const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 8080;

let cachedData = null;
let lastUpdated = null;

// 🔥 Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// 📂 Charger les stations de métro au démarrage
let stationsMetro = null;
const stationsMetroPath = path.join(
  __dirname,
  "../backend/stations_metro.json"
);

function loadStationsMetro() {
  try {
    const rawData = fs.readFileSync(stationsMetroPath, "utf8");
    const jsonData = JSON.parse(rawData);
    stationsMetro = jsonData.features.map((station) => ({
      nom_statio: station.properties.nom_statio,
      commune: station.properties.commune,
      ligne: station.properties.ligne,
      coordinates: station.geometry.coordinates,
    }));
    console.log("✅ Stations de métro chargées !");
  } catch (err) {
    console.error("❌ Erreur lors du chargement des stations de métro :", err);
    stationsMetro = [];
  }
}

// 📌 Charger les stations une fois au démarrage
loadStationsMetro();

// 📂 Exécuter GTFS.py et stocker les données en mémoire
function fetchGTFSData() {
  const scriptPath = path.join(__dirname, "GTFS.py"); // Chemin correct vers GTFS.py
  exec(`python3 ${scriptPath}`, (error, stdout, stderr) => {

    if (error) {
      console.error(
        `❌ Erreur lors de l'exécution du script : ${error.message}`
      );
      cachedData = { error: "Erreur lors de l'exécution du script." };
      return;
    }
    if (stderr) {
      console.error(`⚠️ Erreur dans le script Python : ${stderr}`);
    }
    try {
      cachedData = JSON.parse(stdout);
      lastUpdated = new Date();
    } catch (err) {
      console.error("❌ Erreur lors du parsing JSON :", err);
      cachedData = { error: "Erreur lors du parsing des données GTFS." };
    }
  });
}

// ⏳ Mise à jour automatique toutes les 30 secondes
fetchGTFSData();
setInterval(fetchGTFSData, 30000);

// 📌 API pour récupérer les données GTFS
app.get("/api/gtfs", (req, res) => {
  if (!cachedData) {
    return res.status(503).json({ error: "Données en cours de récupération." });
  }
  res.json({ lastUpdated, data: cachedData });
});

// 📌 API pour récupérer les stations de métro
app.get("/api/stations_metro", (req, res) => {
  if (!stationsMetro) {
    return res.status(503).json({ error: "Données en cours de chargement." });
  }
  res.json(stationsMetro);
});

// Route principale → Affiche `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/index.html"));
});

app.get("/article1.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/article1.html"));
});


app.get("/article2.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/article2.html"));
});

app.get("/article3.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/article3.html"));
});

app.get("/ligne1.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/ligne1.html"));
});

app.get("/ligne2.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/ligne2.html"));
});

app.get("/bus.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/bus.html"));
});
// 🚀 Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
