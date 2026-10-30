import { watchEffect } from 'vue'
import { progress } from './game/progress'

const messages = {
  ar: {
    title: 'شبكة القطط',
    level: 'المرحلة',
    points: 'النقاط',
    ruleColor: 'قطة واحدة لكل لون',
    ruleLine: 'قطة واحدة لكل عمود وصف',
    ruleTouch: 'لا يمكن أن تتلامس القطط',
    howTo: 'انقر مرة لوضع ×، وانقر مرتين لوضع قطة',
    play: 'العب',
    won: 'أحسنت!',
    wonText: 'اكتملت المرحلة',
    next: 'المرحلة التالية',
    lost: 'نفدت الأسماك!',
    lostText: 'لا بأس، حاول مرة أخرى',
    retry: 'حاول مرة أخرى',
    settings: 'الإعدادات',
    language: 'اللغة',
    reset: 'إعادة ضبط التقدم',
    close: 'إغلاق',
    back: 'رجوع',
    powerCat: 'ضع قطة',
    powerBulb: 'تلميح',
    powerMouse: 'الفأر يزيل الأخطاء',
    fishLeft: 'الأسماك المتبقية',
  },
  en: {
    title: 'Cat Grid',
    level: 'Level',
    points: 'Points',
    ruleColor: 'One cat per color',
    ruleLine: 'One cat per row and column',
    ruleTouch: "Cats can't touch",
    howTo: 'Tap once for ×, double-tap for a cat',
    play: 'Play',
    won: 'Well done!',
    wonText: 'Level complete',
    next: 'Next level',
    lost: 'Out of fish!',
    lostText: "No worries, give it another go",
    retry: 'Try again',
    settings: 'Settings',
    language: 'Language',
    reset: 'Reset progress',
    close: 'Close',
    back: 'Back',
    powerCat: 'Place a cat',
    powerBulb: 'Hint',
    powerMouse: 'Mouse clears mistakes',
    fishLeft: 'Fish left',
  },
} as const

export type MessageKey = keyof (typeof messages)['en']

export const t = (key: MessageKey): string => messages[progress.lang][key]

watchEffect(() => {
  document.documentElement.lang = progress.lang
  document.documentElement.dir = progress.lang === 'ar' ? 'rtl' : 'ltr'
})
