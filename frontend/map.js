document.addEventListener("DOMContentLoaded", () => {
    console.log("[Client] DOM ready");

    const map = L.map("map").setView([49.8, 15.5], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
    }).addTo(map);

    console.log("[Client] OSM tile layer added.");

    const layers = {}; // Global object to store Leaflet layers

    const layerStyles = {
        chko: { color: "red", weight: 2 },
        orp: { color: "green", weight: 2 },
        climate_master_geom: { color: "orange", weight: 2 }
    };

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
                return; // Do not attempt L.geoJSON on an error object
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

    // Add event listeners for checkboxes
    document.getElementById("chk-chko").addEventListener("change", (e) => {
        if (e.target.checked) loadLayer("chko");
        else removeLayer("chko");
    });

    document.getElementById("chk-orp").addEventListener("change", (e) => {
        if (e.target.checked) loadLayer("orp");
        else removeLayer("orp");
    });

    document.getElementById("chk-climate_master_geom").addEventListener("change", (e) => {
        if (e.target.checked) loadLayer("climate_master_geom");
        else removeLayer("climate_master_geom");
    });

    // Invalidate map size to ensure it renders correctly,
    // and re-invalidate on window resize
    map.invalidateSize();
    console.log("[Client] Map size invalidated on DOMContentLoaded.");

    window.addEventListener("resize", () => {
        map.invalidateSize();
        console.log("[Client] Map size invalidated on window resize.");
    });
});
