import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { music } from './game/music'

/** One foreground state for CSS, board timers and the native wrapper. */
export function attachLifecycle() {
  let nativeActive = true
  const update = () => {
    const active = nativeActive && !document.hidden
    document.documentElement.classList.toggle('app-inactive', !active)
    window.dispatchEvent(new CustomEvent('catgrid:active', { detail: active }))
    if (!active) music.stop()
  }
  document.addEventListener('visibilitychange', update)
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      nativeActive = isActive
      update()
    })
    void App.addListener('backButton', () => {
      if (location.hash) location.hash = ''
      else void App.exitApp()
    })
  }
  update()
}
