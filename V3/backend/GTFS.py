import requests
import datetime
import json
import sys
import pandas as pd
from google.transit import gtfs_realtime_pb2

sys.stdout.reconfigure(encoding='utf-8')

# 📂 Charger les données des arrêts depuis un fichier Excel (`.xlsx`)
excel_path = "../backend/ilevia_arret_point.xlsx"
df_stops = pd.read_excel(excel_path, dtype={"stop_id": str})  # Assurer que stop_id est une string

# 📌 Normalisation des données (création d'un dictionnaire basé sur stop_id)
stop_info = {
    str(row["stop_id"]): {
        "stop_name": row["stop_name"],
        "stop_desc": row["stop_desc"],
        "geom": row["geom"] if "geom" in row and pd.notna(row["geom"]) else "Non disponible"
    }
    for _, row in df_stops.iterrows()
}

url = "https://proxy.transport.data.gouv.fr/resource/ilevia-lille-gtfs-rt"
response = requests.get(url)

data = {"trips": [], "vehicles": [], "alerts": []}

if response.status_code == 200:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(response.content)

    for entity in feed.entity:
        if entity.HasField('trip_update'):
            trip_update = entity.trip_update
            trip_data = {
                "trip_id": trip_update.trip.trip_id,
                "stops": []
            }
            for stop_time_update in trip_update.stop_time_update:
                stop_id = str(stop_time_update.stop_id)  # Assurer la correspondance avec Excel

                stop_info_data = stop_info.get(stop_id, {})  # Vérifier si l'arrêt existe

                trip_data["stops"].append({
                    "stop_id": stop_id,
                    "stop_name": stop_info_data.get("stop_name", "Inconnu"),
                    "stop_desc": stop_info_data.get("stop_desc", "Non disponible"),
                    "geom": stop_info_data.get("geom", "Non disponible"),
                    "arrival_time": datetime.datetime.fromtimestamp(
                        stop_time_update.arrival.time).strftime('%Y-%m-%d %H:%M:%S') if stop_time_update.arrival.time else "Non disponible",
                    "departure_time": datetime.datetime.fromtimestamp(
                        stop_time_update.departure.time).strftime('%Y-%m-%d %H:%M:%S') if stop_time_update.departure.time else "Non disponible"
                })

            data["trips"].append(trip_data)

    print(json.dumps(data, ensure_ascii=False))

else:
    print(json.dumps({"error": f"Erreur {response.status_code} lors de la récupération des données"}))