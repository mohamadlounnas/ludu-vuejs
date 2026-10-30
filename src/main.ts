import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import './i18n'
import { music } from './game/music'

// iOS Safari only applies :active while some touch listener is around.
document.addEventListener('touchstart', () => {}, { passive: true })

createApp(App).mount('#app')
music.attach()
