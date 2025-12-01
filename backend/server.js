const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// ===============================
// UNIVERZÁLNÍ API PRO VRSTVY
// ===============================

app.get("/api/layers/:table", async (req, res) => {
  const table = req.params.table;

  // POVOLENÉ TABULKY
  const allowed = ["chko", "orp", "climate_master_geom"]; // 'ku' removed as per user request
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: "Invalid table name" });
  }

  // NÁZVOVÉ SLOUPCE PRO POPUP
  let nameColumn;
  switch (table) {
    case "chko":
      nameColumn = "NAZEV";       // CHKO názvy
      break;

    case "orp":
      nameColumn = "NAZ_ORP";    // Obce s rozšířenou působností (Fixed)
      break;

    case "climate_master_geom":
      nameColumn = "NAZ_OBEC";    // Klimatická data – použijeme název obce
      break;
  }

  // LIMIT použijeme JEN pro klimatickou vrstvu (má přes 90k prvků!)
  const limitClause = table === "climate_master_geom" ? "LIMIT 500" : "";

  try {
    // TRANSFORMACE GEOMETRIE DO WGS84 PRO LEAFLET
    const sql = `
      SELECT
        ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry,
        "${nameColumn}" AS nazev
      FROM "${table}"
      ${limitClause};
    `;

    const result = await db.query(sql);

    // VYTVORÍME VALIDNÍ GEOJSON FEATURECOLLECTION
    const geojson = {
      type: "FeatureCollection",
      features: result.rows.map(r => ({
        type: "Feature",
        geometry: r.geometry,
        properties: { nazev: r.nazev }
      }))
    };

    res.json(geojson);

  } catch (err) {
    console.error("SQL ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend běží na http://localhost:${port}`);
});
