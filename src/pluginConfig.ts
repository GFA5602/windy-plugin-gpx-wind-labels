import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-gpx-wind-labels',
    version: '0.1.0',
    icon: '⛵',
    title: 'GPX Wind Labels',
    description:
        'Affiche les points GPX avec leur date, la direction et la vitesse du vent.',
    author: 'Gaël Fabry',
    private: true,
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
};

export default config;