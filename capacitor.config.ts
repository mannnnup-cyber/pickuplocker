import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pickupjamaica.kiosk',
  appName: 'Pickup Kiosk',
  webDir: 'public',
  server: {
    // Point to the live kiosk-lite URL - the app loads this in the WebView.
    // Since kiosk-lite is pure server-rendered HTML with -webkit- prefixes,
    // it works perfectly on Android 5.0 Lollipop's Chrome 37 WebView.
    //
    // For local development, comment out the "url" line and run:
    //   npm run dev
    // Then set url to 'http://10.0.2.2:3000/kiosk-lite' (emulator)
    // or 'http://YOUR_LOCAL_IP:3000/kiosk-lite' (physical device)
    url: 'https://pickuplocker.vercel.app/kiosk-lite',
    // Allow navigation to API routes for form submissions
    allowNavigation: [
      'pickuplocker.vercel.app',
      'api.pickuplocker.vercel.app',
    ],
  },
  android: {
    // Allow mixed content (HTTP API calls from HTTPS page if needed)
    allowMixedContent: true,
    // Use legacy WebView for maximum compatibility with Android 5.0
    useLegacyBridge: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#111111',
      showSpinner: true,
      spinnerColor: '#FFD439',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111111',
    },
  },
};

export default config;
