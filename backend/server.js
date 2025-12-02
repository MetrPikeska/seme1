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
  console.log(`[DEBUG] Received request for table: ${table}`);

  // POVOLENÉ TABULKY
  const allowed = ["chko", "orp", "ku"]; // frontend requests 'ku', but db table is 'ku_cr'
  console.log(`[DEBUG] Allowed tables: ${allowed}`);
  if (!allowed.includes(table)) {
    console.error(`[ERROR] Invalid table name requested: '${table}'. Allowed: ${allowed.join(', ')}`);
    return res.status(400).json({ error: "Invalid table name" });
  }

  // NÁZVOVÉ SLOUPCE PRO POPUP
  let nameColumn;
  let fullTableName;

  switch (table) {
    case "chko":
      nameColumn = "NAZEV";       // CHKO názvy
      fullTableName = `"public"."chko"`;
      break;

    case "orp":
      nameColumn = "NAZ_ORP";    // Obce s rozšířenou působností
      fullTableName = `"public"."orp"`;
      break;

    case "ku":
        nameColumn = "NAZ_KU"; // Katastrální území
        fullTableName = `"ku_cr"`; // Actual table name in DB
        break;
    // No default for table names as they are checked by 'allowed' list
  }
  
  // LIMIT is not applied to base layers (chko, orp, ku)
  const limitClause = ""; 

  try {
    // TRANSFORMACE GEOMETRIE DO WGS84 PRO LEAFLET
    const sql = `
      SELECT
        ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry,
        "${nameColumn}" AS nazev
      FROM ${fullTableName}
      ${limitClause};
    `;
    console.log(`[DEBUG] Executing SQL for /api/layers/${table}: ${sql}`);
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
    console.error(`SQL ERROR for /api/layers/${table}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// CLIMATE API ENDPOINTS
// ===============================

// Helper function to get climate column name dynamically from indicator and period
const getClimateColumn = (indicator, period) => {
  if (period === "year") {
    return `${indicator}_avg`;
  } else if (period.startsWith('m') && parseInt(period.substring(1)) >= 1 && parseInt(period.substring(1)) <= 12) {
    return `${indicator}_${period}`; // e.g., tavg_m1
  }
  // For other period types (DJF, MAM, etc.) or unknown periods, return null for now.
  // This would require more complex backend logic/database columns to support directly.
  return null; // Invalid combination or unsupported period for direct column lookup
};


// METADATA ENDPOINT - ADDED
app.get("/api/climate/meta", async (req, res) => {
  console.log("[DEBUG] Received request for /api/climate/meta");
  try {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'climate_master_geom'
        AND (column_name LIKE '%_m%' OR column_name LIKE '%_avg%'
             OR column_name = 'pet' OR column_name = 'de_martonne' OR column_name = 'heat_index');
    `;
    const result = await db.query(sql);

    const indicators = {};
    const fixedIndicators = ["pet", "de_martonne", "heat_index"];

    result.rows.forEach(row => {
      const colName = row.column_name;
      
      if (fixedIndicators.includes(colName)) { // Handle special indicators directly
        if (!indicators[colName]) {
          indicators[colName] = [];
        }
        if (!indicators[colName].includes('year')) { // Assume these are annual indices
          indicators[colName].push('year');
        }
        return;
      }

      const parts = colName.split('_');
      if (parts.length >= 2) {
        const indicator = parts[0];
        const period = parts.slice(1).join('_'); // Rejoin to handle _avg correctly

        if (!indicators[indicator]) {
          indicators[indicator] = [];
        }
        if (period === 'avg') { // Map _avg to 'year' for consistency with frontend
          if (!indicators[indicator].includes('year')) {
            indicators[indicator].push('year');
          }
        } else { // Monthly periods
          if (!indicators[indicator].includes(period)) {
            indicators[indicator].push(period);
          }
        }
      }
    });

    // Sort monthly periods, 'year' always last
    for (const indicator in indicators) {
        indicators[indicator].sort((a, b) => {
            if (a.startsWith('m') && b.startsWith('m')) {
                return parseInt(a.substring(1)) - parseInt(b.substring(1));
            }
            if (a === 'year' && b !== 'year') return 1;
            if (b === 'year' && a !== 'year') return -1;
            return 0;
        });
    }

    res.json({ indicators });

  } catch (err) {
    console.error("SQL ERROR in /api/climate/meta:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET YEARS ENDPOINT - ADDED
app.get("/api/climate/years", async (req, res) => {
  console.log("[DEBUG] Received request for /api/climate/years");
  try {
    const sql = `
      SELECT DISTINCT year
      FROM climate_master_geom
      ORDER BY year ASC;
    `;
    const result = await db.query(sql);
    const years = result.rows.map(row => row.year);
    res.json({ years });
  } catch (err) {
    console.error("SQL ERROR in /api/climate/years:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// 1. Map choropleth endpoint
app.get("/api/climate/map", async (req, res) => {
  const { indicator, year, period } = req.query; // Changed 'month' to 'period'
  console.log(`[DEBUG] /api/climate/map received. Params: indicator='${indicator}', year='${year}', period='${period}'`);

  if (!indicator || !year || !period) {
    return res.status(400).json({ error: "Missing required query parameters: indicator, year, period" });
  }

  const climateColumn = getClimateColumn(indicator, period);
  if (!climateColumn) {
    console.error(`[ERROR] Invalid indicator ('${indicator}') or period ('${period}') combination for column lookup.`);
    return res.status(400).json({ error: `Invalid indicator ('${indicator}') or period ('${period}') combination.` });
  }

  try {
    const sql = `
      SELECT
        ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry,
        areaid,
        year,
        COALESCE("NAZ_OBEC", "NAZ_KU") AS nazev,
        ${climateColumn} AS value
      FROM climate_master_geom
      WHERE year = $1
        AND ${climateColumn} IS NOT NULL
        AND ${climateColumn} != 'Infinity'
        AND ${climateColumn} != '-Infinity';
    `;

    console.log(`[DEBUG] Executing SQL for /api/climate/map: ${sql}`);
    const result = await db.query(sql, [year]);

    const geojson = {
      type: "FeatureCollection",
      features: result.rows.map(r => ({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          nazev: r.nazev,
          areaid: r.areaid,
          year: r.year,
          value: parseFloat(r.value) // Ensure value is a number
        }
      }))
    };

    res.json(geojson);

  } catch (err) {
    console.error("SQL ERROR in /api/climate/map:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Detail endpoint for one cadastral unit
app.get("/api/climate/detail/:areaid", async (req, res) => {
  const areaid = req.params.areaid;
  const { indicator, period } = req.query; // Changed 'month' to 'period'
  console.log(`[DEBUG] /api/climate/detail/${areaid} received. Indicator: '${indicator}', Period: '${period}'`);

  if (!indicator) {
    return res.status(400).json({ error: "Missing required query parameter: indicator" });
  }

  const monthlyIndicators = ["tavg", "sra", "rh", "wv"];
  const isMonthly = monthlyIndicators.includes(indicator);
  
  try {
    let sql;
    let resultRows;

    // For detail endpoint, we always fetch all monthly values to support frontend chart/table
    // Frontend will then filter/aggregate based on the 'period' parameter.
    const columns = monthlyIndicators.includes(indicator) ? 
                    Array.from({ length: 12 }, (_, i) => `${indicator}_m${i + 1}`).join(", ") : 
                    indicator; // If not monthly, it's an annual index

    sql = `
      SELECT
        areaid,
        "NAZ_KU",
        "NAZ_OBEC",
        year,
        ${columns}
      FROM climate_master_geom
      WHERE areaid = $1
      ORDER BY year ASC;
    `;
    console.log(`[DEBUG] Executing SQL for /api/climate/detail: ${sql}`);
    resultRows = (await db.query(sql, [areaid])).rows;

    const timeSeries = {};
    resultRows.forEach(row => {
        if (isMonthly) {
            timeSeries[row.year] = Array.from({ length: 12 }, (_, i) => {
                const value = row[`${indicator}_m${i + 1}`];
                return (value === null || !isFinite(value)) ? null : parseFloat(value);
            });
        } else {
            const value = row[indicator]; // For annual indices like PET, De Martonne
            timeSeries[row.year] = (value === null || !isFinite(value)) ? null : parseFloat(value);
        }
    });

    res.json({
      areaid: resultRows[0]?.areaid,
      NAZ_KU: resultRows[0]?.NAZ_KU,
      NAZ_OBEC: resultRows[0]?.NAZ_OBEC,
      indicator: indicator,
      timeSeries: timeSeries
    });

  } catch (err) {
    console.error(`SQL ERROR in /api/climate/detail/${areaid}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Aggregation endpoints (ORP, CHKO)
const createAggregationEndpoint = (layerTable, nameColumn) => {
  return async (req, res) => {
    const areaName = req.params.name;
    const { indicator, year, period } = req.query; // Changed 'month' to 'period'
    console.log(`[DEBUG] /api/climate/${layerTable}/${areaName} received. Params: indicator='${indicator}', year='${year}', period='${period}'`);

    if (!indicator || !year || !period) {
      return res.status(400).json({ error: "Missing required query parameters: indicator, year, period" });
    }

    const climateColumn = getClimateColumn(indicator, period);
    if (!climateColumn) {
      console.error(`[ERROR] Invalid indicator ('${indicator}') or period ('${period}') combination for column lookup.`);
      return res.status(400).json({ error: `Invalid indicator ('${indicator}') or period ('${period}') combination.` });
    }

    try {
      const sql = `
        SELECT
          COUNT(DISTINCT c.areaid) AS count,
          AVG(c.${climateColumn}) AS mean,
          MIN(c.${climateColumn}) AS min,
          MAX(c.${climateColumn}) AS max
        FROM climate_master_geom c
        JOIN ${layerTable} l ON ST_Intersects(c.geom, l.geom)
        WHERE l."${nameColumn}" = $1
          AND c.year = $2
          AND c.${climateColumn} IS NOT NULL
          AND c.${climateColumn} != 'Infinity'
          AND c.${climateColumn} != '-Infinity';
      `;
      console.log(`[DEBUG] Executing SQL for /api/climate/${layerTable} aggregation: ${sql}`);
      const result = await db.query(sql, [areaName, year]);
      const row = result.rows[0];

      if (!row || row.count === '0') {
        return res.status(404).json({ error: "No data found for the specified area and criteria." });
      }

      res.json({
        area_name: areaName,
        indicator: indicator,
        year: parseInt(year),
        period: period, // Changed 'month' to 'period'
        count: parseInt(row.count),
        mean: parseFloat(row.mean),
        min: parseFloat(row.min),
        max: parseFloat(row.max)
      });

    } catch (err) {
      console.error(`SQL ERROR in /api/climate/${layerTable}/${areaName}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  };
};

app.get("/api/climate/orp/:name", createAggregationEndpoint("orp", "NAZ_ORP"));
app.get("/api/climate/chko/:name", createAggregationEndpoint("chko", "NAZEV"));

// Always defined at the end
app.listen(port, () => {
  console.log(`Backend běží na http://localhost:${port}`);
});
