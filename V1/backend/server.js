const express = require("express");
const { exec } = require("child_process");
const path = require("path");

const app = express();
const PORT = 8080;

let cachedData = null;
let lastUpdated = null;

// 🔥 Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// 📂 Exécuter GTFS.py et stocker les données en mémoire
function fetchGTFSData() {
  const scriptPath = path.join(__dirname, "GTFS.py"); // Chemin correct vers GTFS.py
  exec(`python3 ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution du script : ${error.message}`);
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

// 📌 API pour récupérer les données
app.get("/api/gtfs", (req, res) => {
  if (!cachedData) {
    return res.status(503).json({ error: "Données en cours de récupération." });
  }
  res.json({ lastUpdated, data: cachedData });
});

// 🌐 Route principale → Affiche `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/templates/index.html"));
});

// 🚀 Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
