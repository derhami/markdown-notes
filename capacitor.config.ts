import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.nounproject.mdnotes',
  appName: 'Markdown Notes',
  webDir: 'dist',
  backgroundColor: '#111214',
  android: {
    allowMixedContent: false,
    backgroundColor: '#111214'
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;