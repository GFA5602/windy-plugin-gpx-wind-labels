<section class="plugin__content">
    <div class="plugin__title">
        GPX Wind Labels
    </div>

    <div class="gpx-panel">
        <label class="file-label" for="gpx-file">
            Sélectionner un fichier GPX
        </label>

        <input
            id="gpx-file"
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            on:change={handleFileSelection}
        />

        <div class="options">
            <label>
                Unité
                <select bind:value={speedUnit} on:change={refreshMarkers}>
                    <option value="kt">nœuds</option>
                    <option value="kmh">km/h</option>
                    <option value="ms">m/s</option>
                </select>
            </label>

            <label>
                <input
                    type="checkbox"
                    bind:checked={fitAfterImport}
                />
                Centrer la carte après import
            </label>
        </div>

        {#if status}
            <p class:status-error={hasError} class="status">
                {status}
            </p>
        {/if}

        {#if points.length > 0}
            <div class="actions">
                <button on:click={refreshMarkers}>
                    Actualiser le vent
                </button>

                <button class="secondary" on:click={clearTrack}>
                    Effacer
                </button>
            </div>

            <p class="information">
                {points.length} point{points.length > 1 ? 's' : ''} GPX
                chargé{points.length > 1 ? 's' : ''}.
            </p>

            <p class="information">
                Format : jour-heure, direction-vitesse.
            </p>

            <p class="information">
                Exemple : <strong>25-14 287-18</strong>
            </p>
        {/if}
    </div>
</section>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { map } from '@windy/map';
    import { getLatLonInterpolator } from '@windy/interpolator';

    type SpeedUnit = 'kt' | 'kmh' | 'ms';

    interface GpxPoint {
        lat: number;
        lon: number;
        time: Date | null;
    }

    interface WindInformation {
        direction: number;
        speedMs: number;
    }

    let points: GpxPoint[] = [];
    let markerLayer: L.LayerGroup | null = null;
    let trackLayer: L.Polyline | null = null;

    let speedUnit: SpeedUnit = 'kt';
    let fitAfterImport = true;

    let status = '';
    let hasError = false;
    let refreshGeneration = 0;

    async function handleFileSelection(event: Event): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        clearTrack();

        status = `Lecture de ${file.name}…`;
        hasError = false;

        try {
            const xml = await file.text();
            points = parseGpx(xml);

            if (points.length === 0) {
                throw new Error(
                    'Le fichier ne contient aucun point GPX exploitable.'
                );
            }

            drawTrack();

            if (fitAfterImport) {
                fitMapToTrack();
            }

            await refreshMarkers();
        } catch (error) {
            console.error(error);

            points = [];
            hasError = true;
            status =
                error instanceof Error
                    ? error.message
                    : 'Impossible de lire le fichier GPX.';
        }
    }

    function parseGpx(xml: string): GpxPoint[] {
        const parser = new DOMParser();
        const document = parser.parseFromString(xml, 'application/xml');

        const parserError = document.querySelector('parsererror');

        if (parserError) {
            throw new Error('Le fichier GPX contient un XML invalide.');
        }

        /*
         * On traite :
         * - les points de trace : trkpt ;
         * - les points de route : rtept ;
         * - les waypoints : wpt.
         *
         * getElementsByTagNameNS("*", ...) permet également de prendre
         * en charge les fichiers GPX utilisant un espace de noms.
         */
        const xmlPoints = [
            ...Array.from(document.getElementsByTagNameNS('*', 'trkpt')),
            ...Array.from(document.getElementsByTagNameNS('*', 'rtept')),
            ...Array.from(document.getElementsByTagNameNS('*', 'wpt')),
        ];

        return xmlPoints
            .map((element): GpxPoint | null => {
                const lat = Number(element.getAttribute('lat'));
                const lon = Number(element.getAttribute('lon'));

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return null;
                }

                const timeElement =
                    element.getElementsByTagNameNS('*', 'time')[0];

                const timeValue = timeElement?.textContent?.trim();
                const parsedTime = timeValue ? new Date(timeValue) : null;

                return {
                    lat,
                    lon,
                    time:
                        parsedTime && !Number.isNaN(parsedTime.getTime())
                            ? parsedTime
                            : null,
                };
            })
            .filter((point): point is GpxPoint => point !== null);
    }

    function drawTrack(): void {
        if (trackLayer) {
            map.removeLayer(trackLayer);
        }

        const coordinates = points.map(
            point => [point.lat, point.lon] as L.LatLngTuple
        );

        trackLayer = L.polyline(coordinates, {
            color: '#00aef3',
            weight: 3,
            opacity: 0.85,
        }).addTo(map);
    }

    function fitMapToTrack(): void {
        if (!trackLayer) {
            return;
        }

        const bounds = trackLayer.getBounds();

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [30, 30],
            });
        }
    }

    async function refreshMarkers(): Promise<void> {
        if (points.length === 0) {
            return;
        }

        const generation = ++refreshGeneration;

        hasError = false;
        status = 'Interpolation du vent…';

        removeMarkers();

        markerLayer = L.layerGroup().addTo(map);

        try {
            const interpolate = await getLatLonInterpolator();

            if (!interpolate) {
                throw new Error(
                    'Les données de vent ne sont pas disponibles. ' +
                    'Affichez la couche Vent dans Windy puis réessayez.'
                );
            }

            let displayedCount = 0;

            /*
             * Traitement par lots pour éviter de bloquer l’interface
             * avec un fichier GPX comportant beaucoup de points.
             */
            const batchSize = 100;

            for (
                let batchStart = 0;
                batchStart < points.length;
                batchStart += batchSize
            ) {
                if (generation !== refreshGeneration) {
                    return;
                }

                const batch = points.slice(
                    batchStart,
                    batchStart + batchSize
                );

                const results = await Promise.all(
                    batch.map(async point => {
                        const rawValue = await interpolate({
                            lat: point.lat,
                            lon: point.lon,
                        });

                        return {
                            point,
                            wind: extractWind(rawValue),
                        };
                    })
                );

                for (const result of results) {
                    if (!result.wind || !markerLayer) {
                        continue;
                    }

                    addWindMarker(
                        result.point,
                        result.wind,
                        markerLayer
                    );

                    displayedCount++;
                }

                status =
                    `${Math.min(batchStart + batchSize, points.length)}` +
                    `/${points.length} points analysés…`;

                await yieldToBrowser();
            }

            status =
                `${displayedCount} étiquette` +
                `${displayedCount > 1 ? 's' : ''} affichée` +
                `${displayedCount > 1 ? 's' : ''}.`;
        } catch (error) {
            console.error(error);

            hasError = true;
            status =
                error instanceof Error
                    ? error.message
                    : 'Impossible d’interpoler le vent.';
        }
    }

    function extractWind(rawValue: unknown): WindInformation | null {
        if (
            !Array.isArray(rawValue) ||
            rawValue.length < 2
        ) {
            return null;
        }

        const u = Number(rawValue[0]);
        const v = Number(rawValue[1]);

        if (!Number.isFinite(u) || !Number.isFinite(v)) {
            return null;
        }

        const speedMs = Math.sqrt(u * u + v * v);

        /*
         * Direction météorologique :
         * direction depuis laquelle vient le vent.
         *
         * u positif : déplacement vers l’est.
         * v positif : déplacement vers le nord.
         */
        const direction =
            (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;

        return {
            direction,
            speedMs,
        };
    }

    function addWindMarker(
        point: GpxPoint,
        wind: WindInformation,
        layer: L.LayerGroup
    ): void {
        const text = formatLabel(point, wind);

        const icon = L.divIcon({
            className: 'gpx-wind-icon',
            html: `<div class="gpx-wind-label">${escapeHtml(text)}</div>`,
            iconSize: [110, 24],
            iconAnchor: [55, 12],
        });

        L.marker([point.lat, point.lon], {
            icon,
            interactive: true,
            keyboard: false,
        })
            .bindTooltip(buildTooltip(point, wind), {
                direction: 'top',
                opacity: 0.95,
            })
            .addTo(layer);
    }

    function formatLabel(
        point: GpxPoint,
        wind: WindInformation
    ): string {
        const datePart = point.time
            ? `${pad2(point.time.getUTCDate())}-${pad2(
                point.time.getUTCHours()
            )}`
            : '-- --';

        const direction = String(
            Math.round(wind.direction) % 360
        ).padStart(3, '0');

        const speed = String(
            Math.round(convertSpeed(wind.speedMs))
        ).padStart(2, '0');

        return `${datePart} ${direction}-${speed}`;
    }

    function buildTooltip(
        point: GpxPoint,
        wind: WindInformation
    ): string {
        const time = point.time
            ? point.time.toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'UTC',
            }) + ' UTC'
            : 'Horodatage absent';

        const direction = Math.round(wind.direction);
        const speed = convertSpeed(wind.speedMs).toFixed(1);

        return [
            `<strong>${escapeHtml(time)}</strong>`,
            `Direction : ${direction.toString().padStart(3, '0')}°`,
            `Vitesse : ${speed} ${getUnitLabel()}`,
        ].join('<br>');
    }

    function convertSpeed(speedMs: number): number {
        switch (speedUnit) {
            case 'kt':
                return speedMs * 1.9438444924;

            case 'kmh':
                return speedMs * 3.6;

            default:
                return speedMs;
        }
    }

    function getUnitLabel(): string {
        switch (speedUnit) {
            case 'kt':
                return 'kt';

            case 'kmh':
                return 'km/h';

            default:
                return 'm/s';
        }
    }

    function pad2(value: number): string {
        return String(value).padStart(2, '0');
    }

    function escapeHtml(value: string): string {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function yieldToBrowser(): Promise<void> {
        return new Promise(resolve => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    function removeMarkers(): void {
        if (markerLayer) {
            map.removeLayer(markerLayer);
            markerLayer = null;
        }
    }

    function clearTrack(): void {
        refreshGeneration++;

        removeMarkers();

        if (trackLayer) {
            map.removeLayer(trackLayer);
            trackLayer = null;
        }

        points = [];
        status = '';
        hasError = false;
    }

    onDestroy(() => {
        clearTrack();
    });
</script>

<style>
    .gpx-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
    }

    input[type='file'] {
        width: 100%;
    }

    .file-label {
        font-weight: 600;
    }

    .options {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
    }

    .options label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .actions {
        display: flex;
        gap: 8px;
    }

    button {
        padding: 8px 12px;
        border: 0;
        border-radius: 6px;
        background: #00aef3;
        color: white;
        cursor: pointer;
        font-weight: 600;
    }

    button.secondary {
        background: #555;
    }

    .status {
        margin: 0;
        padding: 10px;
        border-left: 4px solid #00aef3;
        background: rgba(0, 174, 243, 0.12);
    }

    .status-error {
        border-left-color: #e74c3c;
        background: rgba(231, 76, 60, 0.12);
    }

    .information {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.85;
    }

    :global(.gpx-wind-icon) {
        background: transparent;
        border: none;
    }

    :global(.gpx-wind-label) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 100px;
        height: 22px;
        padding: 0 5px;

        color: #ffffff;
        background: rgba(12, 28, 38, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.75);
        border-radius: 4px;

        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);

        font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            monospace;
        font-size: 11px;
        font-weight: 700;
        line-height: 22px;
        white-space: nowrap;
        text-align: center;
    }
</style>