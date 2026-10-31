import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mohamadlounnas.catgrid',
  appName: 'Cat Grid',
  webDir: 'dist',
  backgroundColor: '#f5efed',
  ios: { contentInset: 'never', preferredContentMode: 'mobile', backgroundColor: '#f5efed' },
  android: { backgroundColor: '#f5efed', allowMixedContent: false },
}
export default config
