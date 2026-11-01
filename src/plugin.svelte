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

                <select
                    bind:value={speedUnit}
                    on:change={refreshMarkers}
                >
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

        <div class="warning">
            Chaque heure GPX est demandée à la timeline Windy. Le plugin
            affiche dans l’infobulle l’heure GPX et l’échéance réellement
            retenue par Windy.
        </div>

        {#if status}
            <p
                class:status-error={hasError}
                class="status"
            >
                {status}
            </p>
        {/if}

        {#if points.length > 0}
            <div class="actions">
                <button
                    type="button"
                    disabled={isRefreshing}
                    on:click={refreshMarkers}
                >
                    {isRefreshing
                        ? 'Interpolation en cours…'
                        : 'Actualiser le vent'}
                </button>

                <button
                    type="button"
                    class="secondary"
                    on:click={clearTrack}
                >
                    Effacer
                </button>
            </div>

            <p class="information">
                {points.length}
                point{points.length > 1 ? 's' : ''}
                GPX chargé{points.length > 1 ? 's' : ''}.
            </p>

            <p class="information">
                Source :
                <strong>{pointSourceLabel}</strong>
            </p>

            <p class="information">
                Modèle Windy :
                <strong>{activeProduct || 'non déterminé'}</strong>
            </p>

            <p class="information">
                Période :
                <strong>{gpxDateRange || 'non déterminée'}</strong>
            </p>

            <p class="information">
                Format :
                <strong>jour-heure direction-vitesse</strong>
            </p>
        {/if}
    </div>
</section>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import { getLatLonInterpolator } from '@windy/interpolator';

    type SpeedUnit = 'kt' | 'kmh' | 'ms';

    type GpxPointType =
        | 'route'
        | 'track'
        | 'waypoint';

    interface GpxPoint {
        lat: number;
        lon: number;
        time: Date | null;
        type: GpxPointType;
        sequence: number;
        cog: number | null;
        sog: number | null;
    }

    interface ParsedGpxResult {
        points: GpxPoint[];
        sourceLabel: string;
    }

    interface ForecastGroup {
        requestedTimestamp: number;
        points: GpxPoint[];
    }

    interface WindInformation {
        direction: number;
        speedMs: number;
        requestedTime: Date;
        effectiveTime: Date;
    }

    interface NavigationData {
        cog: number | null;
        sog: number | null;
    }

    interface RefreshStatistics {
        totalPoints: number;
        timedPoints: number;
        groups: number;
        processedPoints: number;
        displayedCount: number;
        unavailableCount: number;
        missingTimeCount: number;
        rejectedTimestampCount: number;
    }

    let points: GpxPoint[] = [];

    let markerLayer: L.LayerGroup | null = null;
    let trackLayer: L.Polyline | null = null;

    let speedUnit: SpeedUnit = 'kt';
    let fitAfterImport = true;

    let status = '';
    let hasError = false;
    let isRefreshing = false;

    let pointSourceLabel = '';
    let activeProduct = '';
    let gpxDateRange = '';

    /*
     * Chaque actualisation reçoit une génération.
     * Une ancienne génération ne peut plus modifier la carte.
     */
    let refreshGeneration = 0;

    /*
     * Permet d’annuler les attentes encore actives.
     */
    let refreshAbortController: AbortController | null = null;

    /*
     * État Windy à restaurer après l’interpolation.
     */
    let originalTimestamp: number | null = null;
    let originalOverlay: string | null = null;

    async function handleFileSelection(
        event: Event
    ): Promise<void> {
        const input =
            event.currentTarget as HTMLInputElement;

        const file = input.files?.[0];

        if (!file) {
            return;
        }

        clearTrack();

        status = `Lecture de ${file.name}…`;
        hasError = false;

        try {
            const xml = await file.text();
            const parsedResult = parseGpx(xml);

            points = parsedResult.points;
            pointSourceLabel =
                parsedResult.sourceLabel;

            if (points.length === 0) {
                throw new Error(
                    'Le fichier ne contient aucun point GPX exploitable.'
                );
            }

            gpxDateRange =
                buildGpxDateRange(points);

            drawTrack();

            if (fitAfterImport) {
                fitMapToTrack();
                await waitForMapStabilisation();
            }

            await refreshMarkers();
        } catch (error) {
            console.error(
                '[GPX-WIND] Erreur pendant l’import',
                error
            );

            points = [];
            pointSourceLabel = '';
            activeProduct = '';
            gpxDateRange = '';

            hasError = true;

            status =
                error instanceof Error
                    ? error.message
                    : 'Impossible de lire le fichier GPX.';
        } finally {
            /*
             * Permet de sélectionner le même fichier une seconde fois.
             */
            input.value = '';
        }
    }

    function parseGpx(
        xml: string
    ): ParsedGpxResult {
        const parser = new DOMParser();

        const document = parser.parseFromString(
            xml,
            'application/xml'
        );

        if (document.querySelector('parsererror')) {
            throw new Error(
                'Le fichier GPX contient un XML invalide.'
            );
        }

        const routeElements = Array.from(
            document.getElementsByTagNameNS(
                '*',
                'rtept'
            )
        );

        const trackElements = Array.from(
            document.getElementsByTagNameNS(
                '*',
                'trkpt'
            )
        );

        const waypointElements = Array.from(
            document.getElementsByTagNameNS(
                '*',
                'wpt'
            )
        );

        let selectedElements: Element[];
        let pointType: GpxPointType;
        let sourceLabel: string;

        /*
         * Le GPX peut contenir les mêmes points dans rtept et wpt.
         * On ne concatène donc pas les différentes collections.
         */
        if (routeElements.length > 0) {
            selectedElements = routeElements;
            pointType = 'route';
            sourceLabel =
                'points de route GPX (rtept)';
        } else if (trackElements.length > 0) {
            selectedElements = trackElements;
            pointType = 'track';
            sourceLabel =
                'points de trace GPX (trkpt)';
        } else {
            selectedElements = waypointElements;
            pointType = 'waypoint';
            sourceLabel =
                'waypoints GPX (wpt)';
        }

        /*
         * Les waypoints de ton export contiennent COG et SOG
         * dans le champ name.
         */
        const waypointData =
            parseWaypointNavigationData(
                waypointElements
            );

        const parsedPoints = selectedElements
            .map(
                (
                    element,
                    sequence
                ): GpxPoint | null => {
                    const lat = Number(
                        element.getAttribute('lat')
                    );

                    const lon = Number(
                        element.getAttribute('lon')
                    );

                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lon) ||
                        lat < -90 ||
                        lat > 90 ||
                        lon < -180 ||
                        lon > 180
                    ) {
                        return null;
                    }

                    const time =
                        parseElementTime(element);

                    const navigation =
                        findNavigationData(
                            lat,
                            lon,
                            time,
                            waypointData
                        );

                    return {
                        lat,
                        lon,
                        time,
                        type: pointType,
                        sequence,
                        cog: navigation?.cog ?? null,
                        sog: navigation?.sog ?? null,
                    };
                }
            )
            .filter(
                (
                    point
                ): point is GpxPoint =>
                    point !== null
            );

        return {
            points:
                removeDuplicatePoints(
                    parsedPoints
                ),
            sourceLabel,
        };
    }

    function parseElementTime(
        element: Element
    ): Date | null {
        const timeElement =
            element.getElementsByTagNameNS(
                '*',
                'time'
            )[0];

        const value =
            timeElement?.textContent?.trim();

        if (!value) {
            return null;
        }

        const parsedTime = new Date(value);

        return Number.isNaN(
            parsedTime.getTime()
        )
            ? null
            : parsedTime;
    }

    function parseWaypointNavigationData(
        elements: Element[]
    ): GpxPoint[] {
        return elements
            .map(
                (
                    element,
                    sequence
                ): GpxPoint | null => {
                    const lat = Number(
                        element.getAttribute('lat')
                    );

                    const lon = Number(
                        element.getAttribute('lon')
                    );

                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lon)
                    ) {
                        return null;
                    }

                    const nameElement =
                        element.getElementsByTagNameNS(
                            '*',
                            'name'
                        )[0];

                    const name =
                        nameElement?.textContent
                            ?.trim() ?? '';

                    const navigation =
                        parseCogAndSog(name);

                    return {
                        lat,
                        lon,
                        time:
                            parseElementTime(
                                element
                            ),
                        type: 'waypoint',
                        sequence,
                        cog: navigation.cog,
                        sog: navigation.sog,
                    };
                }
            )
            .filter(
                (
                    point
                ): point is GpxPoint =>
                    point !== null
            );
    }

    function parseCogAndSog(
        text: string
    ): NavigationData {
        const cogMatch = text.match(
            /\bCOG\s*:\s*(-?\d+(?:[.,]\d+)?)/i
        );

        const sogMatch = text.match(
            /\bSOG\s*:\s*(-?\d+(?:[.,]\d+)?)/i
        );

        const rawCog = cogMatch
            ? Number(
                cogMatch[1].replace(
                    ',',
                    '.'
                )
            )
            : null;

        const rawSog = sogMatch
            ? Number(
                sogMatch[1].replace(
                    ',',
                    '.'
                )
            )
            : null;

        return {
            cog:
                rawCog !== null &&
                Number.isFinite(rawCog)
                    ? normalizeDirection(rawCog)
                    : null,

            sog:
                rawSog !== null &&
                Number.isFinite(rawSog)
                    ? rawSog
                    : null,
        };
    }

    function findNavigationData(
        lat: number,
        lon: number,
        time: Date | null,
        waypointData: GpxPoint[]
    ): GpxPoint | null {
        const positionTolerance = 0.00001;
        const timeToleranceMs = 60_000;

        return (
            waypointData.find(waypoint => {
                const samePosition =
                    Math.abs(
                        waypoint.lat - lat
                    ) <= positionTolerance &&
                    Math.abs(
                        waypoint.lon - lon
                    ) <= positionTolerance;

                if (!samePosition) {
                    return false;
                }

                if (!time || !waypoint.time) {
                    return true;
                }

                return (
                    Math.abs(
                        waypoint.time.getTime() -
                            time.getTime()
                    ) <= timeToleranceMs
                );
            }) ?? null
        );
    }

    function removeDuplicatePoints(
        sourcePoints: GpxPoint[]
    ): GpxPoint[] {
        const result: GpxPoint[] = [];
        const keys = new Set<string>();

        for (const point of sourcePoints) {
            const key = [
                point.lat.toFixed(5),
                point.lon.toFixed(5),
                point.time?.toISOString() ??
                    'no-time',
            ].join('|');

            if (keys.has(key)) {
                continue;
            }

            keys.add(key);
            result.push(point);
        }

        return result;
    }

    function buildGpxDateRange(
        sourcePoints: GpxPoint[]
    ): string {
        const timestamps = sourcePoints
            .filter(
                (
                    point
                ): point is GpxPoint & {
                    time: Date;
                } => point.time !== null
            )
            .map(point =>
                point.time.getTime()
            );

        if (timestamps.length === 0) {
            return 'aucun horodatage';
        }

        return (
            `${formatUtcDate(
                new Date(
                    Math.min(...timestamps)
                )
            )} à ` +
            `${formatUtcDate(
                new Date(
                    Math.max(...timestamps)
                )
            )}`
        );
    }

    function createForecastGroups(
        sourcePoints: GpxPoint[]
    ): ForecastGroup[] {
        const groups =
            new Map<number, GpxPoint[]>();

        for (const point of sourcePoints) {
            if (!point.time) {
                continue;
            }

            /*
             * Regroupement par heure UTC.
             *
             * 14:00:14 et 14:47:00 utilisent donc la même
             * échéance demandée.
             */
            const forecastDate =
                new Date(
                    point.time.getTime()
                );

            forecastDate.setUTCMinutes(
                0,
                0,
                0
            );

            const requestedTimestamp =
                forecastDate.getTime();

            const groupedPoints =
                groups.get(
                    requestedTimestamp
                ) ?? [];

            groupedPoints.push(point);

            groups.set(
                requestedTimestamp,
                groupedPoints
            );
        }

        return Array.from(
            groups.entries()
        )
            .sort(
                (
                    [timestampA],
                    [timestampB]
                ) =>
                    timestampA -
                    timestampB
            )
            .map(
                ([
                    requestedTimestamp,
                    groupedPoints,
                ]) => ({
                    requestedTimestamp,
                    points: groupedPoints,
                })
            );
    }

    function drawTrack(): void {
        removeTrackLayer();

        if (points.length < 2) {
            return;
        }

        const coordinates = points.map(
            point =>
                [
                    point.lat,
                    point.lon,
                ] as L.LatLngTuple
        );

        trackLayer = L.polyline(
            coordinates,
            {
                color: '#00aef3',
                weight: 3,
                opacity: 0.85,
            }
        ).addTo(map);
    }

    function fitMapToTrack(): void {
        if (!trackLayer) {
            return;
        }

        const bounds =
            trackLayer.getBounds();

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [30, 30],
                animate: false,
            });
        }
    }

    async function refreshMarkers(): Promise<void> {
        if (
            points.length === 0 ||
            isRefreshing
        ) {
            return;
        }

        const generation =
            ++refreshGeneration;

        refreshAbortController?.abort();

        const abortController =
            new AbortController();

        refreshAbortController =
            abortController;

        hasError = false;
        isRefreshing = true;

        removeMarkers();

        /*
         * Ce calque appartient exclusivement à cette actualisation.
         */
        const currentLayer =
            L.layerGroup().addTo(map);

        markerLayer = currentLayer;

        const currentPoints = [...points];

        const statistics:
            RefreshStatistics = {
                totalPoints:
                    currentPoints.length,

                timedPoints:
                    currentPoints.filter(
                        point =>
                            point.time !== null
                    ).length,

                groups: 0,
                processedPoints: 0,
                displayedCount: 0,
                unavailableCount: 0,

                missingTimeCount:
                    currentPoints.filter(
                        point =>
                            point.time === null
                    ).length,

                rejectedTimestampCount: 0,
            };

        try {
            saveOriginalWindyState();

            logStoreCapabilities();

            /*
             * Force l’overlay de vent.
             */
            setStoreValue(
                'overlay',
                'wind'
            );

            activeProduct =
                getStoreString(
                    'product'
                );

            const forecastGroups =
                createForecastGroups(
                    currentPoints
                );

            statistics.groups =
                forecastGroups.length;

            console.log(
                '[GPX-WIND] Forecast groups',
                forecastGroups.map(
                    group => ({
                        requested:
                            new Date(
                                group.requestedTimestamp
                            ).toISOString(),

                        points:
                            group.points.length,
                    })
                )
            );

            if (
                forecastGroups.length === 0
            ) {
                throw new Error(
                    'Aucun point GPX ne contient un horodatage exploitable.'
                );
            }

            for (
                let groupIndex = 0;
                groupIndex <
                forecastGroups.length;
                groupIndex++
            ) {
                assertGenerationCurrent(
                    generation,
                    currentLayer,
                    abortController
                );

                const group =
                    forecastGroups[
                        groupIndex
                    ];

                status =
                    `Chargement de l’échéance ` +
                    `${formatUtcDate(
                        new Date(
                            group.requestedTimestamp
                        )
                    )} ` +
                    `(${groupIndex + 1}/` +
                    `${forecastGroups.length})…`;

                /*
                 * Demande l’heure GPX à la timeline Windy.
                 */
                const timestampRequested =
                    setStoreValue(
                        'timestamp',
                        group.requestedTimestamp
                    );

                if (!timestampRequested) {
                    statistics
                        .rejectedTimestampCount +=
                        group.points.length;

                    console.warn(
                        '[GPX-WIND] Timestamp refusé',
                        {
                            requested:
                                new Date(
                                    group.requestedTimestamp
                                ).toISOString(),

                            effective:
                                getStoreValue(
                                    'timestamp'
                                ),
                        }
                    );

                    continue;
                }

                await waitForTimestampChange(
                    group.requestedTimestamp,
                    abortController,
                    5_000
                );

                assertGenerationCurrent(
                    generation,
                    currentLayer,
                    abortController
                );

                /*
                 * Relit l’heure réellement retenue par Windy.
                 */
                const effectiveTimestamp =
                    normalizeTimestamp(
                        getStoreValue(
                            'timestamp'
                        )
                    );

                if (
                    effectiveTimestamp ===
                    null
                ) {
                    statistics
                        .rejectedTimestampCount +=
                        group.points.length;

                    continue;
                }

                const differenceMinutes =
                    Math.round(
                        (
                            effectiveTimestamp -
                            group.requestedTimestamp
                        ) /
                        60_000
                    );

                console.log(
                    '[GPX-WIND] Timeline',
                    {
                        requested:
                            new Date(
                                group.requestedTimestamp
                            ).toISOString(),

                        effective:
                            new Date(
                                effectiveTimestamp
                            ).toISOString(),

                        differenceMinutes,

                        points:
                            group.points.length,
                    }
                );

                /*
                 * Refuse une échéance manifestement sans rapport avec
                 * l’heure demandée.
                 */
                const maximumDifferenceMs =
                    6 * 60 * 60 * 1000;

                if (
                    Math.abs(
                        effectiveTimestamp -
                        group.requestedTimestamp
                    ) >
                    maximumDifferenceMs
                ) {
                    statistics
                        .rejectedTimestampCount +=
                        group.points.length;

                    console.warn(
                        '[GPX-WIND] Échéance trop éloignée',
                        {
                            requested:
                                new Date(
                                    group.requestedTimestamp
                                ).toISOString(),

                            effective:
                                new Date(
                                    effectiveTimestamp
                                ).toISOString(),

                            differenceMinutes,
                        }
                    );

                    continue;
                }

                /*
                 * Attente du rendu des nouvelles tuiles météo.
                 */
                await waitForForecastRenderer(
                    abortController,
                    1_500
                );

                assertGenerationCurrent(
                    generation,
                    currentLayer,
                    abortController
                );

                /*
                 * L’interpolateur doit être recréé après le changement
                 * de timestamp.
                 */
                const interpolate =
                    await getInterpolatorWithTimeout(
                        10_000
                    );

                if (
                    typeof interpolate !==
                    'function'
                ) {
                    statistics
                        .unavailableCount +=
                        group.points.length;

                    continue;
                }

                for (
                    const point of
                    group.points
                ) {
                    assertGenerationCurrent(
                        generation,
                        currentLayer,
                        abortController
                    );

                    try {
                        /*
                         * L’échéance est portée par le renderer Windy.
                         * Aucun timestamp arbitraire n’est transmis ici.
                         */
                        const rawValue =
                            await interpolate({
                                lat: point.lat,
                                lon: point.lon,
                            });

                        console.debug(
                            '[GPX-WIND] Interpolation',
                            {
                                lat: point.lat,
                                lon: point.lon,

                                requested:
                                    point.time
                                        ?.toISOString(),

                                effective:
                                    new Date(
                                        effectiveTimestamp
                                    ).toISOString(),

                                rawValue,
                            }
                        );

                        const wind =
                            extractWind(
                                rawValue,

                                point.time ??
                                    new Date(
                                        group.requestedTimestamp
                                    ),

                                new Date(
                                    effectiveTimestamp
                                )
                            );

                        statistics
                            .processedPoints++;

                        if (!wind) {
                            statistics
                                .unavailableCount++;

                            continue;
                        }

                        addWindMarker(
                            point,
                            wind,
                            currentLayer
                        );

                        statistics
                            .displayedCount++;
                    } catch (error) {
                        if (
                            isAbortError(error)
                        ) {
                            return;
                        }

                        statistics
                            .processedPoints++;

                        statistics
                            .unavailableCount++;

                        console.warn(
                            '[GPX-WIND] Interpolation impossible',
                            {
                                point,
                                error,
                            }
                        );
                    }
                }
            }

            assertGenerationCurrent(
                generation,
                currentLayer,
                abortController
            );

            status =
                buildStatisticsStatus(
                    statistics
                );

            console.log(
                '[GPX-WIND] Résultat final',
                statistics
            );
        } catch (error) {
            if (
                isAbortError(error) ||
                !isGenerationCurrent(
                    generation,
                    currentLayer,
                    abortController
                )
            ) {
                return;
            }

            console.error(
                '[GPX-WIND] Erreur d’interpolation',
                error
            );

            hasError = true;

            status =
                error instanceof Error
                    ? error.message
                    : 'Impossible d’interpoler le vent.';
        } finally {
            restoreOriginalWindyState();

            if (
                generation ===
                    refreshGeneration &&
                refreshAbortController ===
                    abortController
            ) {
                isRefreshing = false;
                refreshAbortController =
                    null;
            }
        }
    }

    function buildStatisticsStatus(
        statistics: RefreshStatistics
    ): string {
        return [
            `${statistics.totalPoints} points GPX`,
            `${statistics.timedPoints} horodatés`,
            `${statistics.groups} échéances demandées`,

            `${statistics.rejectedTimestampCount} rejetés par la timeline`,

            `${statistics.processedPoints} interpolations exécutées`,

            `${statistics.displayedCount} étiquette` +
                `${
                    statistics.displayedCount > 1
                        ? 's'
                        : ''
                } affichée` +
                `${
                    statistics.displayedCount > 1
                        ? 's'
                        : ''
                }`,

            `${statistics.unavailableCount} indisponible` +
                `${
                    statistics.unavailableCount > 1
                        ? 's'
                        : ''
                }`,
        ].join(' | ');
    }

    function extractWind(
        rawValue: unknown,
        requestedTime: Date,
        effectiveTime: Date
    ): WindInformation | null {
        if (
            rawValue === -1 ||
            rawValue === null ||
            rawValue === undefined
        ) {
            return null;
        }

        if (
            !Array.isArray(rawValue) ||
            rawValue.length < 2
        ) {
            return null;
        }

        const u = Number(rawValue[0]);
        const v = Number(rawValue[1]);

        if (
            !Number.isFinite(u) ||
            !Number.isFinite(v)
        ) {
            return null;
        }

        const speedMs =
            Math.hypot(u, v);

        if (
            !Number.isFinite(speedMs) ||
            speedMs < 0 ||
            speedMs > 150
        ) {
            return null;
        }

        const direction =
            normalizeDirection(
                Math.atan2(-u, -v) *
                    180 /
                    Math.PI
            );

        return {
            direction,
            speedMs,

            requestedTime:
                new Date(
                    requestedTime.getTime()
                ),

            effectiveTime:
                new Date(
                    effectiveTime.getTime()
                ),
        };
    }

    function addWindMarker(
        point: GpxPoint,
        wind: WindInformation,
        layer: L.LayerGroup
    ): void {
        const text =
            formatLabel(
                point,
                wind
            );

        const icon = L.divIcon({
            className:
                'gpx-wind-icon',

            html:
                '<div class="gpx-wind-label">' +
                escapeHtml(text) +
                '</div>',

            iconSize: [170, 24],
            iconAnchor: [85, 12],
        });

        L.marker(
            [point.lat, point.lon],
            {
                icon,
                interactive: true,
                keyboard: false,
            }
        )
            .bindTooltip(
                buildTooltip(
                    point,
                    wind
                ),
                {
                    direction: 'top',
                    opacity: 0.95,
                }
            )
            .addTo(layer);
    }

    function formatLabel(
    point: GpxPoint,
    wind: WindInformation
): string {
    const datePart = point.time
        ? `${pad2(point.time.getUTCDate())}/${pad2(
            point.time.getUTCMonth() + 1
        )}-${pad2(point.time.getUTCHours())}`
        : '--/---';

    const direction = String(
        Math.round(wind.direction) % 360
    ).padStart(3, '0');

    const speed = String(
        Math.round(
            convertSpeed(wind.speedMs)
        )
    );

    return (
        `${datePart} - ` +
        `${direction}° - ` +
        `${speed} ${getUnitLabel()}`
    );
}


    function buildTooltip(
        point: GpxPoint,
        wind: WindInformation
    ): string {
        const differenceMinutes =
            Math.round(
                (
                    wind.effectiveTime.getTime() -
                    wind.requestedTime.getTime()
                ) /
                60_000
            );

        const direction =
            Math.round(
                wind.direction
            );

        const speed =
            convertSpeed(
                wind.speedMs
            ).toFixed(1);

        const lines = [
            `<strong>${escapeHtml(
                formatUtcDate(
                    wind.requestedTime
                )
            )}</strong>`,

            `Type : ${escapeHtml(
                getPointTypeLabel(
                    point.type
                )
            )}`,

            `Échéance Windy : ${escapeHtml(
                formatUtcDate(
                    wind.effectiveTime
                )
            )}`,

            `Écart temporel : ${escapeHtml(
                formatTimeDifference(
                    differenceMinutes
                )
            )}`,

            `Direction du vent : ${direction
                .toString()
                .padStart(3, '0')}°`,

            `Vitesse du vent : ${speed} ${getUnitLabel()}`,
        ];

        if (point.cog !== null) {
            lines.push(
                `COG : ${Math.round(
                    point.cog
                )
                    .toString()
                    .padStart(3, '0')}°`
            );
        }

        if (point.sog !== null) {
            lines.push(
                `SOG : ${point.sog.toFixed(
                    1
                )} kt`
            );
        }

        return lines.join('<br>');
    }

    function logStoreCapabilities(): void {
        const runtimeStore =
            store as unknown as Record<
                string,
                unknown
            >;

        console.log(
            '[GPX-WIND] Store capabilities',
            {
                get:
                    typeof runtimeStore.get,

                set:
                    typeof runtimeStore.set,

                on:
                    typeof runtimeStore.on,

                getAllowed:
                    typeof runtimeStore.getAllowed,

                timestamp:
                    getStoreValue(
                        'timestamp'
                    ),

                product:
                    getStoreValue(
                        'product'
                    ),

                overlay:
                    getStoreValue(
                        'overlay'
                    ),

                level:
                    getStoreValue(
                        'level'
                    ),
            }
        );
    }

    function getStoreValue(
        key: string
    ): unknown {
        try {
            const runtimeStore =
                store as unknown as {
                    get(
                        storeKey: string
                    ): unknown;
                };

            if (
                typeof runtimeStore.get !==
                'function'
            ) {
                return undefined;
            }

            return runtimeStore.get(key);
        } catch (error) {
            console.warn(
                `[GPX-WIND] Lecture du store impossible : ${key}`,
                error
            );

            return undefined;
        }
    }

    function getStoreString(
        key: string
    ): string {
        const value =
            getStoreValue(key);

        return typeof value === 'string'
            ? value
            : '';
    }

    function setStoreValue(
        key: string,
        value: unknown
    ): boolean {
        try {
            const runtimeStore =
                store as unknown as {
                    set(
                        storeKey: string,
                        storeValue: unknown
                    ): unknown;
                };

            if (
                typeof runtimeStore.set !==
                'function'
            ) {
                return false;
            }

            runtimeStore.set(
                key,
                value
            );

            const effectiveValue =
                getStoreValue(key);

            if (key === 'timestamp') {
                const requestedTimestamp =
                    normalizeTimestamp(value);

                const actualTimestamp =
                    normalizeTimestamp(
                        effectiveValue
                    );

                /*
                 * Windy peut arrondir l’heure demandée vers
                 * une échéance de prévision.
                 */
                return (
                    requestedTimestamp !==
                        null &&
                    actualTimestamp !== null
                );
            }

            return (
                effectiveValue === value
            );
        } catch (error) {
            console.warn(
                `[GPX-WIND] Modification du store impossible : ${key}`,
                error
            );

            return false;
        }
    }

    function normalizeTimestamp(
        value: unknown
    ): number | null {
        if (
            typeof value === 'number' &&
            Number.isFinite(value)
        ) {
            /*
             * Accepte valeur Unix en secondes ou millisecondes.
             */
            return value <
                10_000_000_000
                ? value * 1000
                : value;
        }

        if (typeof value === 'string') {
            const numericValue =
                Number(value);

            if (
                Number.isFinite(
                    numericValue
                )
            ) {
                return numericValue <
                    10_000_000_000
                    ? numericValue * 1000
                    : numericValue;
            }

            const dateValue =
                Date.parse(value);

            return Number.isNaN(
                dateValue
            )
                ? null
                : dateValue;
        }

        return null;
    }

    function saveOriginalWindyState(): void {
        if (
            originalTimestamp === null
        ) {
            originalTimestamp =
                normalizeTimestamp(
                    getStoreValue(
                        'timestamp'
                    )
                );
        }

        if (originalOverlay === null) {
            originalOverlay =
                getStoreString(
                    'overlay'
                );
        }
    }

    function restoreOriginalWindyState(): void {
        const timestamp =
            originalTimestamp;

        const overlay =
            originalOverlay;

        originalTimestamp = null;
        originalOverlay = null;

        if (timestamp !== null) {
            setStoreValue(
                'timestamp',
                timestamp
            );
        }

        if (overlay) {
            setStoreValue(
                'overlay',
                overlay
            );
        }
    }

    async function waitForTimestampChange(
        requestedTimestamp: number,
        abortController: AbortController,
        timeoutMs: number
    ): Promise<void> {
        const initialTimestamp =
            normalizeTimestamp(
                getStoreValue(
                    'timestamp'
                )
            );

        const startedAt =
            Date.now();

        while (
            Date.now() - startedAt <
            timeoutMs
        ) {
            throwIfAborted(
                abortController
            );

            const currentTimestamp =
                normalizeTimestamp(
                    getStoreValue(
                        'timestamp'
                    )
                );

            if (
                currentTimestamp !== null &&
                (
                    currentTimestamp !==
                        initialTimestamp ||
                    currentTimestamp ===
                        requestedTimestamp
                )
            ) {
                return;
            }

            await delay(
                50,
                abortController
            );
        }

        /*
         * Windy peut conserver l’heure actuelle si elle est déjà
         * l’échéance retenue. Ce timeout n’est donc pas fatal.
         */
        console.warn(
            '[GPX-WIND] Timeout changement timestamp',
            {
                requested:
                    new Date(
                        requestedTimestamp
                    ).toISOString(),

                current:
                    normalizeTimestamp(
                        getStoreValue(
                            'timestamp'
                        )
                    ),
            }
        );
    }

    async function waitForForecastRenderer(
        abortController: AbortController,
        delayMs: number
    ): Promise<void> {
        await yieldToBrowser();
        await yieldToBrowser();

        await delay(
            delayMs,
            abortController
        );
    }

    async function getInterpolatorWithTimeout(
        timeoutMs: number
    ): Promise<
        Awaited<
            ReturnType<
                typeof getLatLonInterpolator
            >
        >
    > {
        let timeoutId:
            | number
            | null = null;

        try {
            return await Promise.race([
                getLatLonInterpolator(),

                new Promise<never>(
                    (_, reject) => {
                        timeoutId =
                            window.setTimeout(
                                () => {
                                    reject(
                                        new Error(
                                            'Windy n’a pas initialisé ' +
                                            'l’interpolateur dans le délai prévu.'
                                        )
                                    );
                                },
                                timeoutMs
                            );
                    }
                ),
            ]);
        } finally {
            if (timeoutId !== null) {
                window.clearTimeout(
                    timeoutId
                );
            }
        }
    }

    function normalizeDirection(
        direction: number
    ): number {
        return (
            (
                direction % 360
            ) +
            360
        ) % 360;
    }

    function getPointTypeLabel(
        type: GpxPointType
    ): string {
        switch (type) {
            case 'route':
                return 'point de route';

            case 'track':
                return 'point de trace';

            default:
                return 'waypoint';
        }
    }

    function convertSpeed(
        speedMs: number
    ): number {
        switch (speedUnit) {
            case 'kt':
                return (
                    speedMs *
                    1.9438444924
                );

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

    function formatUtcDate(
        date: Date
    ): string {
        return (
            date.toLocaleString(
                'fr-FR',
                {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                }
            ) + ' UTC'
        );
    }

    function formatTimeDifference(
        minutes: number
    ): string {
        if (minutes === 0) {
            return '0 min';
        }

        const sign =
            minutes > 0 ? '+' : '-';

        const absoluteMinutes =
            Math.abs(minutes);

        const hours =
            Math.floor(
                absoluteMinutes / 60
            );

        const remainingMinutes =
            absoluteMinutes % 60;

        if (hours === 0) {
            return (
                `${sign}${remainingMinutes} min`
            );
        }

        return (
            `${sign}${hours} h ` +
            `${remainingMinutes
                .toString()
                .padStart(2, '0')}`
        );
    }

    function pad2(
        value: number
    ): string {
        return String(value).padStart(
            2,
            '0'
        );
    }

    function escapeHtml(
        value: string
    ): string {
        return value
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll(
                "'",
                '&#039;'
            );
    }

    function throwIfAborted(
        abortController: AbortController
    ): void {
        if (
            abortController.signal.aborted
        ) {
            throw new DOMException(
                'Traitement annulé.',
                'AbortError'
            );
        }
    }

    function isAbortError(
        error: unknown
    ): boolean {
        return (
            error instanceof DOMException &&
            error.name === 'AbortError'
        );
    }

    function isGenerationCurrent(
        generation: number,
        layer: L.LayerGroup,
        abortController:
            AbortController
    ): boolean {
        return (
            generation ===
                refreshGeneration &&
            markerLayer === layer &&
            map.hasLayer(layer) &&
            refreshAbortController ===
                abortController &&
            !abortController.signal
                .aborted
        );
    }

    function assertGenerationCurrent(
        generation: number,
        layer: L.LayerGroup,
        abortController:
            AbortController
    ): void {
        if (
            !isGenerationCurrent(
                generation,
                layer,
                abortController
            )
        ) {
            throw new DOMException(
                'Traitement annulé.',
                'AbortError'
            );
        }
    }

    function delay(
        delayMs: number,
        abortController:
            AbortController
    ): Promise<void> {
        return new Promise(
            (resolve, reject) => {
                throwIfAborted(
                    abortController
                );

                const onAbort = (): void => {
                    window.clearTimeout(
                        timeoutId
                    );

                    reject(
                        new DOMException(
                            'Traitement annulé.',
                            'AbortError'
                        )
                    );
                };

                const timeoutId =
                    window.setTimeout(
                        () => {
                            abortController
                                .signal
                                .removeEventListener(
                                    'abort',
                                    onAbort
                                );

                            resolve();
                        },
                        delayMs
                    );

                abortController
                    .signal
                    .addEventListener(
                        'abort',
                        onAbort,
                        {
                            once: true,
                        }
                    );
            }
        );
    }

    function yieldToBrowser():
        Promise<void> {
        return new Promise(resolve => {
            window.requestAnimationFrame(
                () => resolve()
            );
        });
    }

    function waitForMapStabilisation():
        Promise<void> {
        return new Promise(resolve => {
            window.requestAnimationFrame(
                () => {
                    window.requestAnimationFrame(
                        () => {
                            window.setTimeout(
                                resolve,
                                300
                            );
                        }
                    );
                }
            );
        });
    }

    function removeMarkers(): void {
        if (!markerLayer) {
            return;
        }

        markerLayer.clearLayers();

        if (
            map.hasLayer(markerLayer)
        ) {
            map.removeLayer(
                markerLayer
            );
        }

        markerLayer = null;
    }

    function removeTrackLayer(): void {
        if (!trackLayer) {
            return;
        }

        if (
            map.hasLayer(trackLayer)
        ) {
            map.removeLayer(
                trackLayer
            );
        }

        trackLayer = null;
    }

    function clearTrack(): void {
        refreshGeneration++;

        refreshAbortController?.abort();
        refreshAbortController = null;

        isRefreshing = false;

        removeMarkers();
        removeTrackLayer();
        restoreOriginalWindyState();

        points = [];
        pointSourceLabel = '';
        activeProduct = '';
        gpxDateRange = '';

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

    .warning {
        padding: 10px;
        border-left: 4px solid #f0ad4e;
        background: rgba(240, 173, 78, 0.12);
        font-size: 0.88rem;
        line-height: 1.4;
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

    button:disabled {
        cursor: wait;
        opacity: 0.65;
    }

    button.secondary {
        background: #555;
    }

    .status {
        margin: 0;
        padding: 10px;
        border-left: 4px solid #00aef3;
        background: rgba(0, 174, 243, 0.12);
        line-height: 1.45;
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

        min-width: 160px;
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
