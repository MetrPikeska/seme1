// Initialize map
const map = L.map('map').setView([49.8175, 15.4730], 8); // Centered on Czech Republic

// Basemap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Global variables for layers and selected feature
let chkoLayer = null;
let orpLayer = null;
let kuLayer = null;
let climateLayer = null;
let selectedFeatureLayer = null; // To store the highlighted selected feature
let currentChart = null; // To store the Chart.js instance

// Autocomplete data
let allKuNames = [];
let allOrpNames = [];
let allChkoNames = [];

// Backend URL
const backendUrl = 'http://localhost:3000';

// Helper for fetching data
async function fetchData(endpoint) {
    const fullUrl = `${backendUrl}${endpoint}`;
    console.log(`[FRONTEND DEBUG] Fetching: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Fetch error:", error);
        alert(`Failed to load data: ${error.message}`);
        return null;
    }
}

// =================================================================================
// UI Element References
// =================================================================================
const layerChkoCheckbox = document.getElementById('layerChko');
const layerOrpCheckbox = document.getElementById('layerOrp');
const layerKuCheckbox = document.getElementById('layerKu');
const layerClimateCheckbox = document.getElementById('layerClimate');

const territoryTypeRadios = document.querySelectorAll('input[name="territoryType"]');
const territorySearchInput = document.getElementById('territorySearchInput');
const selectFromMapButton = document.getElementById('selectFromMapButton');

const indicatorSelect = document.getElementById('indicatorSelect');
const yearSelect = document.getElementById('yearSelect');
const periodSelect = document.getElementById('periodSelect'); // Changed from monthSelect
const applyClimateButton = document.getElementById('applyClimateButton');

const detailName = document.getElementById('detailName');
const detailLevel = document.getElementById('detailLevel');
const detailIndicator = document.getElementById('detailIndicator');
const detailYear = document.getElementById('detailYear');
const detailPeriod = document.getElementById('detailPeriod'); // Changed from detailMonth

const summaryAreaValue = document.getElementById('summaryAreaValue');
const summaryMinCZ = document.getElementById('summaryMinCZ');
const summaryMaxCZ = document.getElementById('summaryMaxCZ');
const summaryMeanCZ = document.getElementById('summaryMeanCZ');

const timeSeriesTableHeader = document.getElementById('timeSeriesTableHeader');
const timeSeriesTableBody = document.getElementById('timeSeriesTableBody');
const climateChartCanvas = document.getElementById('climateChart');

// =================================================================================
// Utility Functions
// =================================================================================

// Function to populate year dropdown (1991-2020 as per example)
function populateYearDropdown() {
    const currentYear = new Date().getFullYear(); // Optional: use current year as default
    for (let year = 1991; year <= 2020; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
    yearSelect.value = 2020; // Default to the latest year
}

// Function to get color based on value for choropleth
function getColor(d, ranges, colors) {
    for (let i = 0; i < ranges.length; i++) {
        if (d >= ranges[i][0] && d <= ranges[i][1]) {
            return colors[i];
        }
    }
    return '#ccc'; // Default color for null/no data
}

// Function to get style for climate features
function styleClimate(feature, ranges, colors) {
    return {
        fillColor: getColor(feature.properties.value, ranges, colors),
        weight: 1,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

// Function to highlight a feature
function highlightFeature(layer, type) {
    if (selectedFeatureLayer) {
        selectedFeatureLayer.resetStyle(selectedFeatureLayer.feature);
    }
    layer.bringToFront();
    layer.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7,
        className: 'selected-feature'
    });
    selectedFeatureLayer = layer; // Store the currently selected feature layer

    const properties = layer.feature.properties;
    displayDetailPanel(properties.areaid || properties.NAZ_KU || properties.nazev, type);
}

// Function to reset feature highlight
function resetHighlight(e) {
    if (selectedFeatureLayer) {
        selectedFeatureLayer.resetStyle(selectedFeatureLayer.feature);
        selectedFeatureLayer = null;
    }
    clearDetailPanel();
}

// Helper to get period display name for UI (legend, detail panel)
function getPeriodDisplayName(periodValue) {
    const option = periodSelect.querySelector(`option[value="${periodValue}"]`);
    if (option) {
        // Extract text inside parentheses if present, otherwise use full text
        const match = option.textContent.match(/\(([^)]+)\)/);
        return match ? match[1] : option.textContent;
    }
    return periodValue; // Fallback
}


// Function to create and update legend
let currentLegend = null;
function updateLegend(indicatorName, periodLabel, unit, ranges, colors) { // Added periodLabel
    if (currentLegend) {
        map.removeControl(currentLegend);
    }

    currentLegend = L.control({ position: 'bottomright' });

    currentLegend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');
        // Updated legend title to include periodLabel
        div.innerHTML += `<h4>${indicatorName} – ${periodLabel}${unit ? ` (${unit})` : ''}</h4>`;

        // loop through our density intervals and generate a label with a colored square for each interval
        for (let i = 0; i < ranges.length; i++) {
            div.innerHTML +=
                '<i style="background:' + colors[i] + '"></i> ' +
                (ranges[i][0] === -Infinity ? '< ' + ranges[i][1].toFixed(2) : ranges[i][0].toFixed(2) + ' &ndash; ' + ranges[i][1].toFixed(2)) + '<br>';
        }
        return div;
    };

    currentLegend.addTo(map);
}

// =================================================================================
// Layer Loading Functions
// =================================================================================

async function loadBaseLayers() {
    // Load CHKO
    const chkoData = await fetchData('/api/layers/chko');
    if (chkoData) {
        chkoLayer = L.geoJSON(chkoData, {
            style: {
                fillColor: '#a6cee3', // Light blue for CHKO
                weight: 2,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            },
            onEachFeature: function(feature, layer) {
                layer.on('click', (e) => handleLayerClick(e, 'chko'));
                allChkoNames.push(feature.properties.nazev);
            }
        });
    }

    // Load ORP
    const orpData = await fetchData('/api/layers/orp');
    if (orpData) {
        orpLayer = L.geoJSON(orpData, {
            style: {
                fillColor: '#1f78b4', // Darker blue for ORP
                weight: 2,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            },
            onEachFeature: function(feature, layer) {
                layer.on('click', (e) => handleLayerClick(e, 'orp'));
                allOrpNames.push(feature.properties.nazev);
            }
        });
    }

    // Load KU
    const kuData = await fetchData('/api/layers/ku');
    if (kuData) {
        kuLayer = L.geoJSON(kuData, {
            style: {
                fillColor: '#b2df8a', // Light green for KU
                weight: 1,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            },
            onEachFeature: function(feature, layer) {
                layer.on('click', (e) => handleLayerClick(e, 'ku'));
                allKuNames.push(feature.properties.nazev);
            }
        });
    }
}

// =================================================================================
// Climate Map & Choropleth Functions
// =================================================================================

let climateDataGlobal = null; // Store climate data for later use (e.g., summary stats)

async function loadClimateMap(indicator, year, period) { // Changed 'month' to 'period'
    if (!layerClimateCheckbox.checked) {
        if (climateLayer) {
            map.removeLayer(climateLayer);
            climateLayer = null;
        }
        if (currentLegend) {
            map.removeControl(currentLegend);
            currentLegend = null;
        }
        return;
    }

    // Updated API endpoint to use 'period'
    const endpoint = `/api/climate/map?indicator=${indicator}&year=${year}&month=${period}`; // Backend still expects 'month'
    const climateGeojson = await fetchData(endpoint);

    if (!climateGeojson || !climateGeojson.features || climateGeojson.features.length === 0) {
        console.warn("No climate data or invalid GeoJSON received.");
        if (climateLayer) {
            map.removeLayer(climateLayer);
            climateLayer = null;
        }
        if (currentLegend) {
            map.removeControl(currentLegend);
            currentLegend = null;
        }
        alert("No climate data available for the selected parameters.");
        return;
    }

    climateDataGlobal = climateGeojson; // Store for global CZ min/max/mean

    // Compute min/max over finite values only
    const values = climateGeojson.features
        .map(f => f.properties.value)
        .filter(v => v !== null && isFinite(v));

    if (values.length === 0) {
        console.warn("No valid climate values found for choropleth.");
        if (climateLayer) {
            map.removeLayer(climateLayer);
            climateLayer = null;
        }
        if (currentLegend) {
            map.removeControl(currentLegend);
            currentLegend = null;
        }
        alert("No valid climate values for choropleth generation.");
        return;
    }

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const meanVal = values.reduce((a, b) => a + b, 0) / values.length;

    // Determine color ramp and unit based on indicator
    let colorRamp;
    let unit;
    let indicatorDisplayName;

    switch (indicator) {
        case 'tavg':
            colorRamp = ['#3388ff', '#99bbff', '#ffebcc', '#ff9966', '#ff3300']; // Blue to Red
            unit = '°C';
            indicatorDisplayName = 'Průměrná teplota';
            break;
        case 'sra':
            colorRamp = ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#225ea8']; // Yellow to Blue (dry to wet)
            unit = 'mm';
            indicatorDisplayName = 'Srážky';
            break;
        case 'rh':
            colorRamp = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6']; // Light blue to dark blue
            unit = '%';
            indicatorDisplayName = 'Relativní vlhkost';
            break;
        case 'wv':
            colorRamp = ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#43a2ca']; // Light green to teal
            unit = 'm/s';
            indicatorDisplayName = 'Rychlost větru';
            break;
        case 'pet':
            colorRamp = ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000']; // Light orange to dark red
            unit = 'mm';
            indicatorDisplayName = 'PET';
            break;
        case 'de_martonne':
            colorRamp = ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d']; // Light orange to dark orange
            unit = 'index';
            indicatorDisplayName = 'De Martonne';
            break;
        case 'heat_index':
            colorRamp = ['#feebe2', '#fcc5c0', '#fa9fb5', '#f768a1', '#ce1256']; // Light pink to dark pink
            unit = '°C';
            indicatorDisplayName = 'Heat Index';
            break;
        default:
            colorRamp = ['#f0f0f0', '#bdbdbd', '#969696', '#636363', '#252525']; // Grey scale
            unit = '';
            indicatorDisplayName = 'Unknown Indicator';
    }

    // Create 5-class choropleth using equal intervals (simple approach)
    const interval = (maxVal - minVal) / 5;
    const ranges = [];
    for (let i = 0; i < 5; i++) {
        ranges.push([minVal + i * interval, minVal + (i + 1) * interval]);
    }
    // Adjust last range to include maxVal
    ranges[4][1] = maxVal;

    if (climateLayer) {
        map.removeLayer(climateLayer);
    }

    climateLayer = L.geoJSON(climateGeojson, {
        style: (feature) => styleClimate(feature, ranges, colorRamp),
        onEachFeature: function(feature, layer) {
            layer.on('click', (e) => handleLayerClick(e, 'climate'));
        }
    }).addTo(map);

    updateLegend(indicatorDisplayName, getPeriodDisplayName(period), unit, ranges, colorRamp); // Pass period display name
}

// =================================================================================
// Detail Panel Functions
// =================================================================================
let selectedTerritoryId = null; // Stores areaid for KU or name for ORP/CHKO
let selectedTerritoryLevel = null;

function clearDetailPanel() {
    detailName.textContent = 'N/A';
    detailLevel.textContent = 'N/A';
    detailIndicator.textContent = 'N/A';
    detailYear.textContent = 'N/A';
    detailPeriod.textContent = 'N/A'; // Changed from detailMonth
    summaryAreaValue.textContent = 'N/A';
    summaryMinCZ.textContent = 'N/A';
    summaryMaxCZ.textContent = 'N/A';
    summaryMeanCZ.textContent = 'N/A';
    timeSeriesTableHeader.innerHTML = '';
    timeSeriesTableBody.innerHTML = '';
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

async function displayDetailPanel(id, level) {
    clearDetailPanel(); // Clear previous details
    selectedTerritoryId = id;
    selectedTerritoryLevel = level;

    const indicator = indicatorSelect.value;
    const year = yearSelect.value;
    const period = periodSelect.value; // Changed from month

    detailIndicator.textContent = indicatorSelect.options[indicatorSelect.selectedIndex].text;
    detailYear.textContent = year;
    detailPeriod.textContent = getPeriodDisplayName(period); // Use helper for period display name

    let detailData = null;
    let name = '';
    let areaValue = 'N/A';

    if (level === 'ku' || level === 'climate') {
        const endpoint = `/api/climate/detail/${id}?indicator=${indicator}`;
        detailData = await fetchData(endpoint);
        name = detailData?.NAZ_OBEC || detailData?.NAZ_KU || 'N/A';
        detailName.textContent = name;
        detailLevel.textContent = 'Katastrální území';

        // Find the specific value for the selected year and period
        if (detailData && detailData.timeSeries) {
            const yearTimeSeries = detailData.timeSeries[year];
            if (yearTimeSeries) {
                const monthlyIndicators = ["tavg", "sra", "rh", "wv"];
                if (monthlyIndicators.includes(indicator)) {
                    // Monthly data
                    if (period === 'annual') {
                        // Calculate annual average from monthly values
                        const validMonths = yearTimeSeries.filter(v => v !== null && isFinite(v));
                        areaValue = validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length).toFixed(2) : 'N/A';
                    } else if (parseInt(period) >= 1 && parseInt(period) <= 12) {
                        const monthIndex = parseInt(period) - 1;
                        areaValue = (yearTimeSeries[monthIndex] !== null && isFinite(yearTimeSeries[monthIndex])) ? yearTimeSeries[monthIndex].toFixed(2) : 'N/A';
                    } else { // Seasonal/Special periods - backend doesn't support direct query for these
                        areaValue = "N/A"; // Cannot compute directly from monthly data
                    }
                } else {
                    // Annual index data
                    areaValue = (yearTimeSeries !== null && isFinite(yearTimeSeries)) ? yearTimeSeries.toFixed(2) : 'N/A';
                }
            }
        }
    } else if (level === 'orp' || level === 'chko') {
        // Updated API endpoint to use 'period'
        const endpoint = `/api/climate/${level}/${id}?indicator=${indicator}&year=${year}&month=${period}`; // Backend still expects 'month'
        detailData = await fetchData(endpoint);
        name = id; // ORP/CHKO names are passed as IDs in the URL
        detailName.textContent = name;
        detailLevel.textContent = level.toUpperCase();
        if (detailData && detailData.mean !== undefined) {
            areaValue = detailData.mean.toFixed(2);
        }
    }
    summaryAreaValue.textContent = areaValue;

    // Populate time series table and chart
    if (detailData && detailData.timeSeries) {
        updateTimeSeriesTableAndChart(detailData.timeSeries, indicator, period); // Pass period
    }

    // Update global CZ min/max/mean from climateDataGlobal
    if (climateDataGlobal && climateDataGlobal.features.length > 0) {
        const czValues = climateDataGlobal.features
            .map(f => f.properties.value)
            .filter(v => v !== null && isFinite(v));
        if (czValues.length > 0) {
            summaryMinCZ.textContent = Math.min(...czValues).toFixed(2);
            summaryMaxCZ.textContent = Math.max(...czValues).toFixed(2);
            summaryMeanCZ.textContent = (czValues.reduce((a, b) => a + b, 0) / czValues.length).toFixed(2);
        }
    }
}

function updateTimeSeriesTableAndChart(timeSeries, indicator, period) { // Added period
    timeSeriesTableHeader.innerHTML = '';
    timeSeriesTableBody.innerHTML = '';

    const years = Object.keys(timeSeries).map(Number).sort();
    const monthlyIndicators = ["tavg", "sra", "rh", "wv"];
    const isMonthlyIndicator = monthlyIndicators.includes(indicator);

    let chartLabelText = indicatorSelect.options[indicatorSelect.selectedIndex].text;
    let tableHeaderYears = '<th>Year</th>';

    if (isMonthlyIndicator) {
        if (parseInt(period) >= 1 && parseInt(period) <= 12) {
            chartLabelText += ` (${getPeriodDisplayName(period)})`;
            tableHeaderYears += `<th>${getPeriodDisplayName(period)}</th>`; // Only one column for selected month
        } else if (period === 'annual') {
            chartLabelText += ` (Annual Avg)`;
            tableHeaderYears += `<th>Annual Avg</th>`;
        } else { // Seasonal/Special, display annual average in chart for now
            chartLabelText += ` (Annual Avg)`; // Fallback for chart
            tableHeaderYears += `<th>Annual Avg</th>`; // Fallback for table
        }
    } else {
        chartLabelText += ` (${getPeriodDisplayName(period)})`;
        tableHeaderYears += `<th>Value</th>`;
    }


    // Prepare chart data
    const chartLabels = years;
    const chartData = years.map(year => {
        const data = timeSeries[year];
        if (isMonthlyIndicator) {
            if (period === 'annual') {
                const validMonths = data.filter(v => v !== null && isFinite(v));
                return validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length) : null;
            } else if (parseInt(period) >= 1 && parseInt(period) <= 12) {
                const monthIndex = parseInt(period) - 1;
                return (data[monthIndex] !== null && isFinite(data[monthIndex])) ? data[monthIndex] : null;
            } else { // For seasonal/special, show annual average in chart
                const validMonths = data.filter(v => v !== null && isFinite(v));
                return validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length) : null;
            }
        } else {
            return (data !== null && isFinite(data)) ? data : null;
        }
    });

    if (currentChart) {
        currentChart.destroy();
    }
    currentChart = new Chart(climateChartCanvas, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: chartLabelText, // Dynamic chart label
                data: chartData,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                spanGaps: true // Connects null values
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Year'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            }
        }
    });

    // Populate table
    if (isMonthlyIndicator && (parseInt(period) >= 1 && parseInt(period) <= 12)) { // Show only selected month for monthly
        timeSeriesTableHeader.innerHTML = tableHeaderYears;

        years.forEach(year => {
            const rowData = timeSeries[year];
            let rowHtml = `<td>${year}</td>`;
            const val = rowData[parseInt(period) - 1];
            rowHtml += `<td>${(val !== null && isFinite(val)) ? val.toFixed(2) : 'N/A'}</td>`;
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = rowHtml;
            timeSeriesTableBody.appendChild(rowElement);
        });
    } else if (isMonthlyIndicator && period === 'annual') { // Show annual average for monthly-annual
        timeSeriesTableHeader.innerHTML = tableHeaderYears;
        years.forEach(year => {
            const rowData = timeSeries[year];
            const validMonths = rowData.filter(v => v !== null && isFinite(v));
            const avgVal = validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length) : null;
            let rowHtml = `<td>${year}</td>`;
            rowHtml += `<td>${(avgVal !== null && isFinite(avgVal)) ? avgVal.toFixed(2) : 'N/A'}</td>`;
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = rowHtml;
            timeSeriesTableBody.appendChild(rowElement);
        });
    } else if (isMonthlyIndicator) { // For Seasonal/Special periods of monthly indicators, show all 12 months in table
        const monthNames = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
        let headerRow = '<th>Year</th>';
        monthNames.forEach(month => { headerRow += `<th>${month}</th>`; });
        timeSeriesTableHeader.innerHTML = headerRow;

        years.forEach(year => {
            const rowData = timeSeries[year];
            let rowHtml = `<td>${year}</td>`;
            rowData.forEach(val => {
                rowHtml += `<td>${(val !== null && isFinite(val)) ? val.toFixed(2) : 'N/A'}</td>`;
            });
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = rowHtml;
            timeSeriesTableBody.appendChild(rowElement);
        });
    }
    else {
        // Annual table header
        timeSeriesTableHeader.innerHTML = '<th>Year</th><th>Value</th>';

        // Annual table body
        years.forEach(year => {
            const val = timeSeries[year];
            const rowHtml = `<td>${year}</td><td>${(val !== null && isFinite(val)) ? val.toFixed(2) : 'N/A'}</td>`;
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = rowHtml;
            timeSeriesTableBody.appendChild(rowElement);
        });
    }
}

// =================================================================================
// Event Handlers
// =================================================================================

function handleLayerClick(e, layerType) {
    if (selectFromMapButton.classList.contains('active')) {
        // If "Vybrat z mapy" is active, select the feature
        highlightFeature(e.layer, layerType);
        // Also update the radio button and search input
        document.querySelector(`input[name="territoryType"][value="${layerType === 'climate' ? 'ku' : layerType}"]`).checked = true;
        territorySearchInput.value = e.layer.feature.properties.nazev;
        // Deactivate selection mode after selection
        selectFromMapButton.classList.remove('active');
        selectFromMapButton.textContent = 'Vybrat z mapy';
        map.off('click', mapClickToClear); // Remove map-wide click listener
    } else {
        // If not in selection mode, just show popup or do default behavior
        // (for now, default to highlighting and showing detail)
        highlightFeature(e.layer, layerType);
    }
}


function mapClickToClear(e) {
    if (selectedFeatureLayer) {
        selectedFeatureLayer.resetStyle(selectedFeatureLayer.feature);
        selectedFeatureLayer = null;
    }
    clearDetailPanel();
}


// Event listener for "Vybrat z mapy" button
selectFromMapButton.addEventListener('click', () => {
    if (selectFromMapButton.classList.toggle('active')) {
        selectFromMapButton.textContent = 'Click on map to select...';
        map.on('click', mapClickToClear); // Add a general map click listener to clear selection
    } else {
        selectFromMapButton.textContent = 'Vybrat z mapy';
        map.off('click', mapClickToClear); // Remove map-wide click listener
        resetHighlight(); // Clear any existing selection
    }
});


// Layer checkbox change handlers
layerChkoCheckbox.addEventListener('change', () => {
    if (layerChkoCheckbox.checked) {
        if (chkoLayer) chkoLayer.addTo(map);
    } else {
        if (chkoLayer) map.removeLayer(chkoLayer);
    }
});

layerOrpCheckbox.addEventListener('change', () => {
    if (layerOrpCheckbox.checked) {
        if (orpLayer) orpLayer.addTo(map);
    } else {
        if (orpLayer) map.removeLayer(orpLayer);
    }
});

layerKuCheckbox.addEventListener('change', () => {
    if (layerKuCheckbox.checked) {
        if (kuLayer) kuLayer.addTo(map);
    } else {
        if (kuLayer) map.removeLayer(kuLayer);
    }
});

layerClimateCheckbox.addEventListener('change', () => {
    if (layerClimateCheckbox.checked) {
        // If climate layer is enabled, re-apply climate parameters
        applyClimateButton.click();
    } else {
        // If disabled, remove it
        if (climateLayer) {
            map.removeLayer(climateLayer);
            climateLayer = null;
        }
        if (currentLegend) {
            map.removeControl(currentLegend);
            currentLegend = null;
        }
    }
});

// Apply climate button handler
applyClimateButton.addEventListener('click', () => {
    const indicator = indicatorSelect.value;
    const year = yearSelect.value;
    const period = periodSelect.value; // Changed from monthSelect.value
    loadClimateMap(indicator, year, period); // Pass period instead of month

    // If a territory is already selected, re-display its details with new climate params
    if (selectedTerritoryId && selectedTerritoryLevel) {
        displayDetailPanel(selectedTerritoryId, selectedTerritoryLevel);
    }
});

// Initial setup
populateYearDropdown();
loadBaseLayers();

// Function for client-side autocomplete
function autocomplete(inp, arr) {
    let currentFocus;
    inp.addEventListener("input", function(e) {
        let a, b, i, val = this.value;
        closeAllLists();
        if (!val) { return false;}
        currentFocus = -1;
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);
        for (i = 0; i < arr.length; i++) {
            if (arr[i].toUpperCase().includes(val.toUpperCase())) { // Changed to includes for broader search
                b = document.createElement("DIV");
                b.innerHTML = "<strong>" + arr[i].substr(0, arr[i].toUpperCase().indexOf(val.toUpperCase())) + "</strong>";
                b.innerHTML += arr[i].substr(arr[i].toUpperCase().indexOf(val.toUpperCase()), val.length);
                b.innerHTML += arr[i].substr(arr[i].toUpperCase().indexOf(val.toUpperCase()) + val.length);
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener("click", function(e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                    // Manually trigger selection after autocomplete
                    const selectedName = inp.value;
                    let targetLayer = null;
                    let targetLevel = null;

                    const currentTerritoryType = document.querySelector('input[name="territoryType"]:checked').value;

                    switch (currentTerritoryType) {
                        case 'ku':
                            if (kuLayer) targetLayer = kuLayer;
                            targetLevel = 'ku';
                            break;
                        case 'orp':
                            if (orpLayer) targetLayer = orpLayer;
                            targetLevel = 'orp';
                            break;
                        case 'chko':
                            if (chkoLayer) targetLayer = chkoLayer;
                            targetLevel = 'chko';
                            break;
                    }

                    if (targetLayer) {
                        targetLayer.eachLayer(function(layer) {
                            if (layer.feature.properties.nazev === selectedName) {
                                highlightFeature(layer, targetLevel);
                                map.fitBounds(layer.getBounds());
                            }
                        });
                    }
                });
                a.appendChild(b);
            }
        }
    });

    inp.addEventListener("keydown", function(e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { // DOWN key
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // UP key
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // ENTER key
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllLists(elmnt) {
        let x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}

// Attach autocomplete to the search input based on selected territory type
territoryTypeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        territorySearchInput.value = ''; // Clear search input on type change
        const selectedType = document.querySelector('input[name="territoryType"]:checked').value;
        let dataArray = [];
        switch (selectedType) {
            case 'ku': dataArray = allKuNames; break;
            case 'orp': dataArray = allOrpNames; break;
            case 'chko': dataArray = allChkoNames; break;
        }
        autocomplete(territorySearchInput, dataArray);
    });
});

// Initial autocomplete setup for KU (default)
autocomplete(territorySearchInput, allKuNames);
