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

// Global climate metadata from /api/climate/meta
let climateMetadata = { indicators: {}, years: [] };

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
const periodSelect = document.getElementById('periodSelect'); 
const applyClimateButton = document.getElementById('applyClimateButton');

const detailName = document.getElementById('detailName');
const detailLevel = document.getElementById('detailLevel');
const detailIndicator = document.getElementById('detailIndicator');
const detailYear = document.getElementById('detailYear');
const detailPeriod = document.getElementById('detailPeriod');

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

// Helper to get period display name for UI (legend, detail panel)
const monthNames = {
    'm1': 'Leden', 'm2': 'Únor', 'm3': 'Březen', 'm4': 'Duben',
    'm5': 'Květen', 'm6': 'Červen', 'm7': 'Červenec', 'm8': 'Srpen',
    'm9': 'Září', 'm10': 'Říjen', 'm11': 'Listopad', 'm12': 'Prosinec'
};
function getPeriodDisplayName(periodValue) {
    if (periodValue.startsWith('m')) {
        return monthNames[periodValue] || `M${periodValue.substring(1)}`;
    } else if (periodValue === 'year') {
        return 'Celoroční průměr';
    }
    return periodValue; // Fallback for other periods not explicitly mapped
}

// Helper to get indicator display name for UI (dropdown, legend, detail panel)
function getIndicatorDisplayName(indicatorValue) {
    switch(indicatorValue) {
        case 'tavg': return 'Průměrná teplota (TAVG)';
        case 'sra': return 'Srážky (SRA)';
        case 'rh': return 'Relativní vlhkost (RH)';
        case 'wv': return 'Rychlost větru (WV)';
        case 'pet': return 'PET';
        case 'de_martonne': return 'De Martonne';
        case 'heat_index': return 'Heat Index';
        default: return indicatorValue.toUpperCase();
    }
}

// Function to populate year dropdown dynamically
async function populateYearsDropdown() {
    const data = await fetchData('/api/climate/years');
    if (data && data.years) {
        climateMetadata.years = data.years;
        yearSelect.innerHTML = ''; // Clear existing options
        data.years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        yearSelect.value = Math.max(...data.years); // Default to latest year
    }
}

// Function to populate indicator and period dropdowns dynamically
async function populateClimateDropdowns() {
    const data = await fetchData('/api/climate/meta');
    if (data && data.indicators) {
        climateMetadata.indicators = data.indicators;
        indicatorSelect.innerHTML = ''; // Clear existing options

        const allIndicators = Object.keys(data.indicators);
        const fixedIndicators = ["pet", "de_martonne", "heat_index"]; // These do not have _mX or _avg suffixes
        
        // Add dynamic indicators first
        allIndicators.sort().forEach(indicator => {
            if (!fixedIndicators.includes(indicator)) {
                const option = document.createElement('option');
                option.value = indicator;
                option.textContent = getIndicatorDisplayName(indicator);
                indicatorSelect.appendChild(option);
            }
        });
        // Then add fixed indicators
        fixedIndicators.forEach(indicator => {
            const option = document.createElement('option');
            option.value = indicator;
            option.textContent = getIndicatorDisplayName(indicator);
            indicatorSelect.appendChild(option);
        });

        // Trigger period dropdown population for the default selected indicator
        populatePeriodDropdown(indicatorSelect.value);
    }
}

// Function to populate period dropdown based on selected indicator
function populatePeriodDropdown(selectedIndicator) {
    periodSelect.innerHTML = ''; // Clear existing options
    const periods = climateMetadata.indicators[selectedIndicator];
    if (periods) {
        // Create optgroups manually
        const monthlyOptgroup = document.createElement('optgroup');
        monthlyOptgroup.label = 'Monthly';
        const annualOptgroup = document.createElement('optgroup');
        annualOptgroup.label = 'Annual';

        periods.forEach(period => {
            const option = document.createElement('option');
            option.value = period;
            option.textContent = getPeriodDisplayName(period);
            if (period.startsWith('m')) {
                monthlyOptgroup.appendChild(option);
            } else if (period === 'year') {
                annualOptgroup.appendChild(option);
            }
            // Ignore other period types (DJF, MAM, etc.) for now as backend only supports mX and year
        });

        if (monthlyOptgroup.children.length > 0) periodSelect.appendChild(monthlyOptgroup);
        if (annualOptgroup.children.length > 0) periodSelect.appendChild(annualOptgroup);
        
        // Set default period
        if (periodSelect.children.length > 0) {
            periodSelect.value = 'year'; // Default to annual
            if (!periods.includes('year') && periods.length > 0) {
                periodSelect.value = periods[0]; // If no 'year', select first available
            }
        }
    }
}

// Event listener for indicator select change
indicatorSelect.addEventListener('change', (e) => {
    populatePeriodDropdown(e.target.value);
});


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


// Function to create and update legend
let currentLegend = null;
function updateLegend(indicatorName, periodLabel, unit, ranges, colors) { 
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

async function loadClimateMap(indicator, year, period) {
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
    const endpoint = `/api/climate/map?indicator=${indicator}&year=${year}&period=${period}`; 
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
    // const meanVal = values.reduce((a, b) => a + b, 0) / values.length; // Not directly used here, only in CZ summary

    // Determine color ramp and unit based on indicator
    let colorRamp;
    let unit;
    let indicatorDisplayName = getIndicatorDisplayName(indicator);

    switch (indicator) {
        case 'tavg': unit = '°C'; break;
        case 'sra': unit = 'mm'; break;
        case 'rh': unit = '%'; break;
        case 'wv': unit = 'm/s'; break;
        case 'pet': unit = 'mm'; break;
        case 'de_martonne': unit = 'index'; break;
        case 'heat_index': unit = '°C'; break;
        default: unit = '';
    }

    // Default color ramps, can be refined for specific periods if needed
    // The current color ramps are defined for general indicator values.
    switch (indicator) {
        case 'tavg': colorRamp = ['#3388ff', '#99bbff', '#ffebcc', '#ff9966', '#ff3300']; break; // Blue to Red
        case 'sra': colorRamp = ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#225ea8']; break; // Yellow to Blue (dry to wet)
        case 'rh': colorRamp = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6']; break; // Light blue to dark blue
        case 'wv': colorRamp = ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#43a2ca']; break; // Light green to teal
        case 'pet': colorRamp = ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000']; break; // Light orange to dark red
        case 'de_martonne': colorRamp = ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d']; break; // Light orange to dark orange
        case 'heat_index': colorRamp = ['#feebe2', '#fcc5c0', '#fa9fb5', '#f768a1', '#ce1256']; break; // Light pink to dark pink
        default: colorRamp = ['#f0f0f0', '#bdbdbd', '#969696', '#636363', '#252525']; // Grey scale
    }

    // Create 5-class choropleth using equal intervals (simple approach)
    const interval = (maxVal - minVal) / 5;
    const ranges = [];
    for (let i = 0; i < 5; i++) {
        ranges.push([minVal + i * interval, minVal + (i + 1) * interval]);
    }
    ranges[4][1] = maxVal; // Adjust last range to include maxVal

    if (climateLayer) {
        map.removeLayer(climateLayer);
    }

    climateLayer = L.geoJSON(climateGeojson, {
        style: (feature) => styleClimate(feature, ranges, colorRamp),
        onEachFeature: function(feature, layer) {
            layer.on('click', (e) => handleLayerClick(e, 'climate'));
        }
    }).addTo(map);

    updateLegend(indicatorDisplayName, getPeriodDisplayName(period), unit, ranges, colorRamp);
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
    detailPeriod.textContent = 'N/A';
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
    const period = periodSelect.value;

    detailIndicator.textContent = getIndicatorDisplayName(indicator);
    detailYear.textContent = year;
    detailPeriod.textContent = getPeriodDisplayName(period);

    let detailData = null;
    let name = '';
    let areaValue = 'N/A';

    if (level === 'ku' || level === 'climate') {
        const endpoint = `/api/climate/detail/${id}?indicator=${indicator}&period=${period}`; // Pass period to detail for consistent frontend aggregation
        detailData = await fetchData(endpoint);
        name = detailData?.NAZ_OBEC || detailData?.NAZ_KU || 'N/A';
        detailName.textContent = name;
        detailLevel.textContent = 'Katastrální území';

        // Find the specific value for the selected year and period from timeSeries
        if (detailData && detailData.timeSeries) {
            const yearTimeSeries = detailData.timeSeries[year];
            if (yearTimeSeries) {
                const monthlyIndicatorsFromMeta = Object.keys(climateMetadata.indicators).filter(ind => 
                    climateMetadata.indicators[ind].some(p => p.startsWith('m'))
                );
                const isMonthlyDataIndicator = monthlyIndicatorsFromMeta.includes(indicator);

                if (isMonthlyDataIndicator) { // If the indicator has monthly data
                    if (period === 'year') { // Annual average from monthly data
                        const validMonths = yearTimeSeries.filter(v => v !== null && isFinite(v));
                        areaValue = validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length).toFixed(2) : 'N/A';
                    } else if (period.startsWith('m') && parseInt(period.substring(1)) >= 1 && parseInt(period.substring(1)) <= 12) { // Specific month
                        const monthIndex = parseInt(period.substring(1)) - 1;
                        areaValue = (yearTimeSeries[monthIndex] !== null && isFinite(yearTimeSeries[monthIndex])) ? yearTimeSeries[monthIndex].toFixed(2) : 'N/A';
                    } else { // Seasonal/Special periods (not directly from timeSeries, display N/A or fallback)
                        areaValue = "N/A"; 
                    }
                } else { // For annual indices like PET, De Martonne, Heat Index
                    areaValue = (yearTimeSeries !== null && isFinite(yearTimeSeries)) ? yearTimeSeries.toFixed(2) : 'N/A';
                }
            }
        }
    } else if (level === 'orp' || level === 'chko') {
        // Updated API endpoint to use 'period'
        const endpoint = `/api/climate/${level}/${id}?indicator=${indicator}&year=${year}&period=${period}`; 
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
        updateTimeSeriesTableAndChart(detailData.timeSeries, indicator, period);
    }

    // Update global CZ min/max/mean from climateDataGlobal (only for climate layer selection)
    if (level === 'climate' && climateDataGlobal && climateDataGlobal.features.length > 0) {
        const czValues = climateDataGlobal.features
            .map(f => f.properties.value)
            .filter(v => v !== null && isFinite(v));
        if (czValues.length > 0) {
            summaryMinCZ.textContent = Math.min(...czValues).toFixed(2);
            summaryMaxCZ.textContent = Math.max(...czValues).toFixed(2);
            summaryMeanCZ.textContent = (czValues.reduce((a, b) => a + b, 0) / czValues.length).toFixed(2);
        }
    } else { // Clear CZ summary if not a climate layer or no climate data
        summaryMinCZ.textContent = 'N/A';
        summaryMaxCZ.textContent = 'N/A';
        summaryMeanCZ.textContent = 'N/A';
    }
}

function updateTimeSeriesTableAndChart(timeSeries, indicator, period) {
    timeSeriesTableHeader.innerHTML = '';
    timeSeriesTableBody.innerHTML = '';

    const years = Object.keys(timeSeries).map(Number).sort();
    const monthlyIndicatorsFromMeta = Object.keys(climateMetadata.indicators).filter(ind => 
        climateMetadata.indicators[ind].some(p => p.startsWith('m'))
    );
    const isMonthlyDataIndicator = monthlyIndicatorsFromMeta.includes(indicator);

    let chartLabelText = getIndicatorDisplayName(indicator);
    let tableHeaderCells = '<th>Year</th>';

    // Chart Data Preparation
    const chartLabels = years;
    const chartData = years.map(year => {
        const data = timeSeries[year];
        if (isMonthlyDataIndicator) {
            if (period === 'year') { // Annual average from monthly data
                const validMonths = data.filter(v => v !== null && isFinite(v));
                return validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length) : null;
            } else if (period.startsWith('m')) { // Specific month
                const monthIndex = parseInt(period.substring(1)) - 1;
                return (data[monthIndex] !== null && isFinite(data[monthIndex])) ? data[monthIndex] : null;
            } else { // Seasonal/Special periods (display annual avg in chart for now)
                const validMonths = data.filter(v => v !== null && isFinite(v));
                return validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length) : null;
            }
        } else { // Annual index data
            return (data !== null && isFinite(data)) ? data : null;
        }
    });

    // Chart Label based on period
    if (isMonthlyDataIndicator) {
        if (period === 'year') { chartLabelText += ' (Annual Avg)'; }
        else if (period.startsWith('m')) { chartLabelText += ` (${getPeriodDisplayName(period)})`; }
        else { chartLabelText += ' (Annual Avg)'; } // Fallback for seasonal/special in chart
    } else {
        chartLabelText += ` (${getPeriodDisplayName(period)})`;
    }

    if (currentChart) {
        currentChart.destroy();
    }
    currentChart = new Chart(climateChartCanvas, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: chartLabelText,
                data: chartData,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Year' } },
                y: { title: { display: true, text: 'Value' } }
            }
        }
    });

    // Table Data Preparation
    if (isMonthlyDataIndicator && (period === 'year' || period.startsWith('m'))) {
        tableHeaderCells += `<th>${getPeriodDisplayName(period)}</th>`;
        timeSeriesTableHeader.innerHTML = tableHeaderCells;
        years.forEach(year => {
            const rowData = timeSeries[year];
            let valueToDisplay = 'N/A';
            if (period === 'year') {
                const validMonths = rowData.filter(v => v !== null && isFinite(v));
                valueToDisplay = validMonths.length > 0 ? (validMonths.reduce((a, b) => a + b, 0) / validMonths.length).toFixed(2) : 'N/A';
            } else if (period.startsWith('m')) {
                const monthIndex = parseInt(period.substring(1)) - 1;
                valueToDisplay = (rowData[monthIndex] !== null && isFinite(rowData[monthIndex])) ? rowData[monthIndex].toFixed(2) : 'N/A';
            }
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = `<td>${year}</td><td>${valueToDisplay}</td>`;
            timeSeriesTableBody.appendChild(rowElement);
        });
    } else if (isMonthlyDataIndicator) { // Monthly data indicators with Seasonal/Special period selected
        monthNamesArr = ['M1 (Leden)', 'M2 (Únor)', 'M3 (Březen)', 'M4 (Duben)', 'M5 (Květen)', 'M6 (Červen)', 'M7 (Červenec)', 'M8 (Srpen)', 'M9 (Září)', 'M10 (Říjen)', 'M11 (Listopad)', 'M12 (Prosinec)'];
        monthNamesArr.forEach(name => tableHeaderCells += `<th>${name}</th>`);
        timeSeriesTableHeader.innerHTML = tableHeaderCells;
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

    } else { // Annual index data
        tableHeaderCells += `<th>Value</th>`;
        timeSeriesTableHeader.innerHTML = tableHeaderCells;
        years.forEach(year => {
            const val = timeSeries[year];
            const rowElement = document.createElement('tr');
            rowElement.innerHTML = `<td>${year}</td><td>${(val !== null && isFinite(val)) ? val.toFixed(2) : 'N/A'}</td>`;
            timeSeriesTableBody.appendChild(rowElement);
        });
    }
}

// =================================================================================
// Event Handlers
// =================================================================================

function handleLayerClick(e, layerType) {
    if (selectFromMapButton.classList.contains('active')) {
        highlightFeature(e.layer, layerType);
        document.querySelector(`input[name="territoryType"][value="${layerType === 'climate' ? 'ku' : layerType}"]`).checked = true;
        territorySearchInput.value = e.layer.feature.properties.nazev;
        selectFromMapButton.classList.remove('active');
        selectFromMapButton.textContent = 'Vybrat z mapy';
        map.off('click', mapClickToClear); 
    } else {
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

selectFromMapButton.addEventListener('click', () => {
    if (selectFromMapButton.classList.toggle('active')) {
        selectFromMapButton.textContent = 'Click on map to select...';
        map.on('click', mapClickToClear); 
    } else {
        selectFromMapButton.textContent = 'Vybrat z mapy';
        map.off('click', mapClickToClear); 
        resetHighlight(); 
    }
});

layerChkoCheckbox.addEventListener('change', () => {
    if (layerChkoCheckbox.checked) { if (chkoLayer) chkoLayer.addTo(map); } 
    else { if (chkoLayer) map.removeLayer(chkoLayer); }
});

layerOrpCheckbox.addEventListener('change', () => {
    if (layerOrpCheckbox.checked) { if (orpLayer) orpLayer.addTo(map); } 
    else { if (orpLayer) map.removeLayer(orpLayer); }
});

layerKuCheckbox.addEventListener('change', () => {
    if (layerKuCheckbox.checked) { if (kuLayer) kuLayer.addTo(map); } 
    else { if (kuLayer) map.removeLayer(kuLayer); }
});

layerClimateCheckbox.addEventListener('change', () => {
    if (layerClimateCheckbox.checked) { applyClimateButton.click(); } 
    else {
        if (climateLayer) { map.removeLayer(climateLayer); climateLayer = null; }
        if (currentLegend) { map.removeControl(currentLegend); currentLegend = null; }
    }
});

applyClimateButton.addEventListener('click', () => {
    const indicator = indicatorSelect.value;
    const year = yearSelect.value;
    const period = periodSelect.value;
    loadClimateMap(indicator, year, period);

    if (selectedTerritoryId && selectedTerritoryLevel) {
        displayDetailPanel(selectedTerritoryId, selectedTerritoryLevel);
    }
});

// Initial setup
populateYearsDropdown();
populateClimateDropdowns();
loadBaseLayers();

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
            if (arr[i].toUpperCase().includes(val.toUpperCase())) { 
                b = document.createElement("DIV");
                b.innerHTML = "<strong>" + arr[i].substr(0, arr[i].toUpperCase().indexOf(val.toUpperCase())) + "</strong>";
                b.innerHTML += arr[i].substr(arr[i].toUpperCase().indexOf(val.toUpperCase()), val.length);
                b.innerHTML += arr[i].substr(arr[i].toUpperCase().indexOf(val.toUpperCase()) + val.length);
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener("click", function(e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                    const selectedName = inp.value;
                    let targetLayer = null;
                    let targetLevel = null;

                    const currentTerritoryType = document.querySelector('input[name="territoryType"]:checked').value;

                    switch (currentTerritoryType) {
                        case 'ku': if (kuLayer) targetLayer = kuLayer; targetLevel = 'ku'; break;
                        case 'orp': if (orpLayer) targetLayer = orpLayer; targetLevel = 'orp'; break;
                        case 'chko': if (chkoLayer) targetLayer = chkoLayer; targetLevel = 'chko'; break;
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
        if (e.keyCode == 40) { 
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { 
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { 
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

territoryTypeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        territorySearchInput.value = ''; 
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

autocomplete(territorySearchInput, allKuNames);
