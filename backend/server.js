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
  const allowed = ["chko", "orp", "ku"]; // frontend requests 'ku', but db table is 'ku_cz'
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
        fullTableName = `"ku_cr"`; // Corrected table name based on image: ku_cr
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

You will NOT rewrite or break my existing working Leaflet web application.  
You will extend the UI so that it fully matches the methodology and data structure  
of the GEOTE semester assignment.

Keep the existing functionality working.
Only ADD new UI functionality.

==========================================================
### CONTEXT (IMPORTANT)

My climate dataset includes these temporal aggregation types for each variable:

1) Monthly data:
   M1, M2, … M12  

2) Seasonal aggregations:
   DJF  (December–January–February)
   MAM  (March–April–May)
   JJA  (June–July–August)
   SON  (September–October–November)

3) Special aggregations:
   A-S  (Annual Scale – year-based average)
   O-M  (October–March period)

4) Annual averages:
   *_avg in database

The UI must reflect these real data categories.

==========================================================
### YOUR TASK — MODIFY ONLY THE FRONTEND UI:

Update ONLY these files:
- `/frontend/index.html`
- `/frontend/style.css`
- `/frontend/map.js`

Do NOT remove or break any existing working logic.
Integrate new UI elements cleanly into the existing sidebar structure.

==========================================================
### REQUIRED UI CHANGES:

## 1. Expand the climate controls section in the sidebar:

Add a new dropdown:
**Time period selection**
- Monthly:
    • M1 (Leden)
    • M2 (Únor)
    • M3 (Březen)
    • …
    • M12 (Prosinec)
- Seasonal:
    • DJF (Zima)
    • MAM (Jaro)
    • JJA (Léto)
    • SON (Podzim)
- Special:
    • A-S (Annual Scale)
    • O-M (Říjen–Březen)
- Annual:
    • YEAR (Celoroční průměr)

Structure the dropdown with HTML `<optgroup>` to keep the UI clean.

Example:

<select id="periodSelect">
  <optgroup label="Monthly">
    <option value="1">January</option>
    ...
    <option value="12">December</option>
  </optgroup>

  <optgroup label="Seasonal">
    <option value="djf">DJF (Winter)</option>
    <option value="mam">MAM (Spring)</option>
    <option value="jja">JJA (Summer)</option>
    <option value="son">SON (Autumn)</option>
  </optgroup>

  <optgroup label="Special">
    <option value="as">A–S</option>
    <option value="om">O–M</option>
  </optgroup>

  <optgroup label="Annual">
    <option value="annual">Annual Average</option>
  </optgroup>
</select>

Keep styling consistent with current UI.

==========================================================
### 2. Modify legend dynamically

Legend box must display:
- indicator name (e.g., “TAVG”)
- period label (e.g., “JJA”, “M5”, “Annual”, “O–M”)
- proper units (°C, mm, %, m/s)

Example title:
“Average Temperature – JJA (°C)”

Map.js must update this automatically when user clicks Apply.

==========================================================
### 3. Modify Apply button behavior

When user selects:
- indicator
- year
- period (month / season / special / annual)

Map.js must assemble API request:

/api/climate/map?indicator=XXX&year=YYYY&period=PERIOD

PERIOD may be:
- "1"…"12"  
- "djf"
- "mam"
- "jja"
- "son"
- "as"
- "om"
- "annual"

Do NOT modify backend logic here — just adjust frontend request and UI.

==========================================================
### 4. Extend sidebar layout

Add a visually separated “Time Period” section:

Climate Data
---------------------------------------
Indicator:    [dropdown]
Year:         [dropdown]
Period:       [dropdown you will create]
[Apply button]

Spacing, typography, and alignment must stay consistent with existing CSS.

==========================================================
### 5. Update detail panel (if present)

When a polygon is clicked, display selected:

- indicator
- year
- period label (e.g., DJF, MAM, M10, O-M)
- value for the polygon

Do NOT change data logic — only UI elements.

==========================================================
### 6. Update chart labeling

The popup / detail chart must include correct labels:

For monthly:
  “Monthly values (M1–M12)”
For seasonal:
  “DJF, MAM, JJA, SON”
For special:
  “A-S”, “O-M”
For annual:
  “Annual Average”

Map.js should update chart titles based on selected period.

==========================================================
### 7. Code Quality Requirements

- Do NOT delete anything functional.
- Insert code only where necessary.
- Keep naming consistent (“periodSelect”, “selectedPeriod” etc.)
- Use only vanilla JS.
- Ensure dropdown updates do not break existing CHKO / ORP / KU logic.
- Use CSS classes already present to maintain styling.

==========================================================
### OUTPUT DELIVERABLES

Output three files:
1. Updated `/frontend/index.html`
2. Updated `/frontend/style.css`
3. Updated `/frontend/map.js`

Each with clearly marked inserted sections (comments: <!-- added -->, // added).

==========================================================

This UI extension must fully match the real dataset structure and be methodologically correct for the semester assignment.
  } catch (err) {
    console.error(`SQL ERROR for /api/layers/${table}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// CLIMATE API ENDPOINTS
// ===============================

// Helper function to get climate column name
const getClimateColumn = (indicator, month) => {
  const monthlyIndicators = ["tavg", "sra", "rh", "wv"];
  if (monthlyIndicators.includes(indicator)) {
    if (month === "annual") {
      return `${indicator}_avg`;
    } else if (parseInt(month) >= 1 && parseInt(month) <= 12) { // Use parseInt for month check
      return `${indicator}_m${month}`;
    }
  } else if (["pet", "de_martonne", "heat_index"].includes(indicator)) {
    return indicator; // These are annual/index values, month is ignored
  }
  return null; // Invalid combination
};

// 1. Map choropleth endpoint
app.get("/api/climate/map", async (req, res) => {
  const { indicator, year, month } = req.query;
  console.log(`[DEBUG] /api/climate/map received. Params: indicator='${indicator}', year='${year}', month='${month}'`);

  if (!indicator || !year || !month) {
    return res.status(400).json({ error: "Missing required query parameters: indicator, year, month" });
  }

  const climateColumn = getClimateColumn(indicator, month);
  if (!climateColumn) {
    return res.status(400).json({ error: "Invalid indicator or month combination" });
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
  const { indicator } = req.query;

  if (!indicator) {
    return res.status(400).json({ error: "Missing required query parameter: indicator" });
  }

  const monthlyIndicators = ["tavg", "sra", "rh", "wv"];
  const isMonthly = monthlyIndicators.includes(indicator);
  console.log(`[DEBUG] /api/climate/detail/${areaid} received. Indicator: '${indicator}' (Monthly: ${isMonthly})`);

  try {
    let sql;
    let resultRows;

    if (isMonthly) {
      // Fetch all monthly values for all years for the given indicator
      const columns = Array.from({ length: 12 }, (_, i) => `${indicator}_m${i + 1}`).join(", ");
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
      console.log(`[DEBUG] Executing SQL for /api/climate/detail (monthly): ${sql}`);
      resultRows = (await db.query(sql, [areaid])).rows;

      const timeSeries = {};
      resultRows.forEach(row => {
        timeSeries[row.year] = Array.from({ length: 12 }, (_, i) => {
          const value = row[`${indicator}_m${i + 1}`];
          return (value === null || !isFinite(value)) ? null : parseFloat(value);
        });
      });

      res.json({
        areaid: resultRows[0]?.areaid,
        NAZ_KU: resultRows[0]?.NAZ_KU,
        NAZ_OBEC: resultRows[0]?.NAZ_OBEC,
        indicator: indicator,
        timeSeries: timeSeries
      });

    } else {
      // Fetch annual values for all years for the given indicator
      sql = `
        SELECT
          areaid,
          "NAZ_KU",
          "NAZ_OBEC",
          year,
          ${indicator} AS value
        FROM climate_master_geom
        WHERE areaid = $1
          AND ${indicator} IS NOT NULL
          AND ${indicator} != 'Infinity'
          AND ${indicator} != '-Infinity'
        ORDER BY year ASC;
      `;
      console.log(`[DEBUG] Executing SQL for /api/climate/detail (annual): ${sql}`);
      resultRows = (await db.query(sql, [areaid])).rows;

      const timeSeries = {};
      resultRows.forEach(row => {
        timeSeries[row.year] = parseFloat(row.value);
      });

      res.json({
        areaid: resultRows[0]?.areaid,
        NAZ_KU: resultRows[0]?.NAZ_KU,
        NAZ_OBEC: resultRows[0]?.NAZ_OBEC,
        indicator: indicator,
        timeSeries: timeSeries
      });
    }

  } catch (err) {
    console.error(`SQL ERROR in /api/climate/detail/${areaid}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Aggregation endpoints (ORP, CHKO)
const createAggregationEndpoint = (layerTable, nameColumn) => {
  return async (req, res) => {
    const areaName = req.params.name;
    const { indicator, year, month } = req.query;
    console.log(`[DEBUG] /api/climate/${layerTable}/${areaName} received. Params: indicator='${indicator}', year='${year}', month='${month}'`);

    if (!indicator || !year || !month) {
      return res.status(400).json({ error: "Missing required query parameters: indicator, year, month" });
    }

    const climateColumn = getClimateColumn(indicator, month);
    if (!climateColumn) {
      return res.status(400).json({ error: "Invalid indicator or month combination" });
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
        month: month,
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
