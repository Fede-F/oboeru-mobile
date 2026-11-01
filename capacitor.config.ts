import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Configuration — Oboeru (Offline-First Japanese SRS)
 */
const config: CapacitorConfig = {
  appId: 'ar.planner.oboeru',
  appName: 'Oboeru',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    CapacitorUpdater: {
      // Control manual determinístico vía src/lib/otaUpdater.js (notifyAppReady)
      autoUpdate: false,
      resetWhenUpdate: false,
      statsUrl: ''
    },
    SplashScreen: {
      launchShowDuration: 1400,
      launchAutoHide: true,
      backgroundColor: '#090d16',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090d16'
    }
  }
};

export default config;
