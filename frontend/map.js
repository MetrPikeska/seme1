document.addEventListener("DOMContentLoaded", () => {
    console.log("[Client] DOM ready");

    const map = L.map("map").setView([49.8, 15.5], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
    }).addTo(map);

    console.log("[Client] OSM tile layer added.");

    // Global objects to store Leaflet layers and Chart.js instance
    const layers = {};
    let climateLayer = null;
    let currentChart = null;

    const layerStyles = {
        chko: { color: "red", weight: 2, fillOpacity: 0.1 },
        orp: { color: "green", weight: 2, fillOpacity: 0.1 }
        // climate_master_geom style will be dynamic (choropleth)
    };

    const climateIndicators = {
        tavg: { label: "Average Temperature", unit: "°C", colorScale: ["#a2d9ff", "#ff8c8c"] }, // Blue to red
        sra: { label: "Total Precipitation", unit: "mm", colorScale: ["#f7ebae", "#83a2d0"] }, // Yellow to blue
        rh: { label: "Relative Humidity", unit: "%", colorScale: ["#e0e0e0", "#5c5c5c"] }, // Grey scale
        wv: { label: "Wind Velocity", unit: "m/s", colorScale: ["#c5e8c1", "#3b8d2d"] }, // Light green to dark green
        pet: { label: "Potential Evapotranspiration", unit: "mm", colorScale: ["#fff5ba", "#d46a00"] }, // Light yellow to orange
        demartonne: { label: "De Martonne Aridity Index", unit: "", colorScale: ["#e6ffe6", "#336600"] }, // Light green to dark green
        heatindex: { label: "Heat Index", unit: "°C", colorScale: ["#ffffd9", "#bd0026"] } // Light yellow to dark red
    };

    // Helper to get month name
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    async function loadLayer(name) {
        if (layers[name]) {
            console.log(`[Client] Layer "${name}" is already on the map.`);
            return;
        }

        console.log(`[Client] Loading layer "${name}"...`);
        try {
            const response = await fetch(`http://localhost:3000/api/layers/${name}`);
            if (!response.ok) {
                console.error(`[Client] HTTP error for ${name}:`, response.status);
                return;
            }
            const geojson = await response.json();
            if (!geojson || geojson.type !== "FeatureCollection") {
                console.error(`[Client] Invalid GeoJSON for ${name}:`, geojson);
                return;
            }

            console.log(`[Client] Layer "${name}" GeoJSON received.`);

            const geoJsonLayer = L.geoJSON(geojson, {
                style: layerStyles[name],
                onEachFeature: (feature, layer) => {
                    if (feature.properties?.nazev) {
                        layer.bindPopup(feature.properties.nazev);
                    }
                }
            }).addTo(map);

            layers[name] = geoJsonLayer;
            console.log(`[Client] Layer "${name}" added to map.`);

        } catch (error) {
            console.error(`[Client] Error loading layer "${name}":`, error);
        }
    }

    function removeLayer(name) {
        if (layers[name]) {
            console.log(`[Client] Removing layer "${name}"...`);
            map.removeLayer(layers[name]);
            delete layers[name];
            console.log(`[Client] Layer "${name}" removed from map.`);
        } else {
            console.log(`[Client] Layer "${name}" not found on map.`);
        }
    }

    // Climate layer functions
    async function loadClimateLayer(indicatorBase, year, month) {
        console.log(`[Client] Loading climate layer for ${indicatorBase} (Year: ${year}, Month: ${month})...`);

        // Remove existing climate layer if any
        if (climateLayer) {
            map.removeLayer(climateLayer);
            climateLayer = null;
            console.log("[Client] Existing climate layer removed.");
        }

        const endpoint = `http://localhost:3000/api/layers/climate_master_geom`;
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                console.error(`[Client] HTTP error for climate_master_geom:`, response.status);
                return;
            }
            const geojson = await response.json();
            if (!geojson || geojson.type !== "FeatureCollection") {
                console.error(`[Client] Invalid GeoJSON for climate_master_geom:`, geojson);
                return;
            }

            console.log("[Client] Climate GeoJSON received.");

            const selectedIndicator = month === 'annual' ? `${indicatorBase}_annual` : `${indicatorBase}_m${month}`;

            // Calculate min/max values for color scale
            let minVal = Infinity;
            let maxVal = -Infinity;
            geojson.features.forEach(feature => {
                const value = feature.properties[selectedIndicator];
                if (value !== null && value !== undefined) {
                    minVal = Math.min(minVal, value);
                    maxVal = Math.max(maxVal, value);
                }
            });
            console.log(`[Client] Climate data range: Min=${minVal}, Max=${maxVal}`);

            const getColor = createColorScale(climateIndicators[indicatorBase].colorScale, minVal, maxVal);

            climateLayer = L.geoJSON(geojson, {
                style: (feature) => {
                    const value = feature.properties[selectedIndicator];
                    return {
                        fillColor: value !== null && value !== undefined ? getColor(value) : '#ccc', // Grey for no data
                        weight: 1,
                        opacity: 1,
                        color: 'white',
                        dashArray: '3',
                        fillOpacity: 0.7
                    };
                },
                onEachFeature: (feature, layer) => {
                    layer.on('click', (e) => showPolygonPopup(e.target.feature, indicatorBase, year));
                }
            }).addTo(map);

            layers['climate_master_geom'] = climateLayer; // Store it for general layer management
            console.log("[Client] Climate layer added to map with choropleth styling.");

            buildLegend(minVal, maxVal, climateIndicators[indicatorBase].colorScale, climateIndicators[indicatorBase].unit);

        } catch (error) {
            console.error(`[Client] Error loading climate layer:`, error);
        }
    }

    function createColorScale(colors, min, max) {
        const scale = d3.scaleLinear().domain([min, (min + max) / 2, max]).range(colors); // Using a 3-point scale for smoother transition
        return (value) => value !== null && value !== undefined ? scale(value) : '#ccc';
    }

    function buildLegend(min, max, colors, unit) {
        const legendDiv = document.getElementById('legend');
        legendDiv.innerHTML = `<h4>${climateIndicators[document.getElementById('indicator-select').value.replace(/_m$/, '')].label} (${unit})</h4>`;
        const gradientStops = colors.length === 2 ?
                                `linear-gradient(to right, ${colors[0]}, ${colors[1]})` :
                                `linear-gradient(to right, ${colors[0]}, ${colors[1]}, ${colors[2]})`;
        
        legendDiv.innerHTML += `
            <div class="legend-scale" style="background: ${gradientStops}; height: 20px; width: 100%; margin-bottom: 5px;"></div>
            <div style="display: flex; justify-content: space-between;">
                <span>${min.toFixed(2)}</span>
                <span>${max.toFixed(2)}</span>
            </div>
        `;
        legendDiv.style.display = 'block';
    }

    // Popup with Chart.js
    function showPolygonPopup(feature, indicatorBase, year) {
        const props = feature.properties;
        const popupContainer = document.getElementById('popup-container');
        const popupProperties = document.getElementById('popup-properties');
        const popupClimateTable = document.getElementById('popup-climate-table');
        const climateChartCanvas = document.getElementById('climate-chart');

        popupProperties.innerHTML = `
            <strong>Název:</strong> ${props.nazev || 'N/A'}<br>
            <strong>Area ID:</strong> ${props.areaid || 'N/A'}
        `;

        // Build climate values table
        let tableHTML = '<thead><tr><th>Month</th><th>Value</th></tr></thead><tbody>';
        const chartLabels = [];
        const chartData = [];
        for (let i = 1; i <= 12; i++) {
            const monthKey = `${indicatorBase}_m${i}`;
            const value = props[monthKey]?.toFixed(2) || 'N/A';
            tableHTML += `<tr><td>${monthNames[i-1]}</td><td>${value} ${climateIndicators[indicatorBase].unit}</td></tr>`;
            chartLabels.push(monthNames[i-1].substring(0, 3)); // Jan, Feb, etc.
            chartData.push(props[monthKey]);
        }
        tableHTML += '</tbody>';
        popupClimateTable.innerHTML = tableHTML;

        // Render Chart.js
        if (currentChart) {
            currentChart.destroy();
        }
        currentChart = new Chart(climateChartCanvas, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: `${climateIndicators[indicatorBase].label} (${year})`,
                    data: chartData,
                    borderColor: climateIndicators[indicatorBase].colorScale[0], // Use first color from scale
                    backgroundColor: 'rgba(0,0,0,0)',
                    tension: 0.1,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: `${climateIndicators[indicatorBase].label} (${climateIndicators[indicatorBase].unit})`
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw?.toFixed(2) || 'N/A'} ${climateIndicators[indicatorBase].unit}`;
                            }
                        }
                    }
                }
            }
        });

        popupContainer.style.display = 'flex';
    }


    // Event Listeners for Layer Controls
    document.getElementById("chk-chko").addEventListener("change", (e) => {
        if (e.target.checked) loadLayer("chko");
        else removeLayer("chko");
    });

    document.getElementById("chk-orp").addEventListener("change", (e) => {
        if (e.target.checked) loadLayer("orp");
        else removeLayer("orp");
    });

    // Event listener for Climate Layer checkbox
    document.getElementById("chk-climate_master_geom").addEventListener("change", (e) => {
        if (e.target.checked) {
            // Automatically trigger load for selected climate data
            document.getElementById("apply-filters").click();
        } else {
            if (climateLayer) {
                map.removeLayer(climateLayer);
                climateLayer = null;
                document.getElementById('legend').style.display = 'none'; // Hide legend
                console.log("[Client] Climate layer removed by checkbox.");
            }
        }
    });

    // Event Listener for Apply Filters Button
    document.getElementById("apply-filters").addEventListener("click", () => {
        const indicatorBase = document.getElementById("indicator-select").value.replace(/_m$/, ''); // Remove _m suffix for indicatorBase
        const year = document.getElementById("year-select").value; // Year is currently static in dropdown, might need dynamic population
        const month = document.getElementById("month-select").value;

        // Only load if climate_master_geom checkbox is checked
        if (document.getElementById("chk-climate_master_geom").checked) {
             loadClimateLayer(indicatorBase, year, month);
        } else {
            console.log("[Client] Klima layer checkbox not checked. Not loading climate data.");
        }
    });

    // Initial map invalidation
    map.invalidateSize();
    console.log("[Client] Map size invalidated on DOMContentLoaded.");

    window.addEventListener("resize", () => {
        map.invalidateSize();
        console.log("[Client] Map size invalidated on window resize.");
    });
});
