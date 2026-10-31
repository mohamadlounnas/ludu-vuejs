import { watchEffect } from 'vue'
import { progress } from './game/progress'

const messages = {
  ar: {
    title: 'شبكة القطط',
    privacy: 'الخصوصية',
    support: 'المساعدة',
    level: 'المرحلة',
    points: 'النقاط',
    ruleColor: 'قطة واحدة لكل لون',
    ruleLine: 'قطة واحدة لكل عمود وصف',
    ruleTouch: 'لا يمكن أن تتلامس القطط',
    howTo: 'انقر مرة لوضع ×، وانقر مرتين لوضع قطة',
    play: 'العب',
    won: 'أحسنت!',
    levelDone: 'أكملت المرحلة {n}!',
    next: 'المرحلة التالية',
    lost: 'نفدت السمكات',
    left: 'المتبقي',
    getFish: 'احصل على 3 سمكات',
    retry: 'إعادة',
    daily: 'التحدي اليومي',
    dailyShort: 'اليومي',
    dailyDone: 'أكملت تحدي اليوم!',
    streak: 'أيام متتالية',
    home: 'الرئيسية',
    settings: 'الإعدادات',
    language: 'اللغة',
    reset: 'إعادة ضبط التقدم',
    close: 'إغلاق',
    back: 'رجوع',
    powerCat: 'ضع قطة',
    powerBulb: 'تلميح',
    powerMouse: 'الفأر يزيل الأخطاء',
    fishLeft: 'الأسماك المتبقية',
    inks: 'ألوان التحديد',
    inkPen: 'القلم الأبيض',
    inkTest: 'لون تجريبي',
    undo: 'تراجع',
    eraseInk: 'امسح هذا اللون',
    contradictionShort: 'تناقض!',
    noRoom: 'لا مكان للقطة!',
    inkKeep: 'اعتمد ✓',
    inkCrossOut: 'اشطبها ✕',
    inkIdle: 'انقر مرتين = قطة تجريبية',
    sound: 'الأصوات',
    music: 'الموسيقى',
    petCat: 'داعب القطة',
    resetAsk: 'إعادة ضبط كل التقدم؟ ستفقد المرحلة والنقاط والسلسلة والمساعدات.',
    resetYes: 'نعم، أعد الضبط',
    cancel: 'إلغاء',
    diffEasy: 'سهل',
    tipTap: 'انقر هنا لتضع ✕، لا يمكن أن تكون قطة هنا',
    autoCheckOn: 'مساعد الشطب يعمل في أول ٥ مراحل',
    grownCat: 'كبرت وصرت قطًا يعتمد على نفسه!',
    grownCatBody: 'تقاعدت مخالب المساعدة. من الآن، اشطب الخانات بنفسك بنقرة واحدة. مياو، أنت قدّها!',
    tipCat: 'انقر مرتين هنا: هذه الخانة يجب أن تكون قطة',
    techSingle: 'الخانة الأخيرة: لم يبقَ في هذه المجموعة إلا خانة واحدة',
    techConfine: 'الحصر: هذه المجموعة محصورة في هذه الخطوط، فاشطب باقيها',
    techSqueeze: 'الضغط: قطة هنا ستمحو مجموعة كاملة',
    coachPick: 'اختر لونًا لتجرّب فكرة',
    coachGhost: 'انقر مرتين لقطة تجريبية',
    coachCrossOut: 'أحمر؟ الفكرة خاطئة، اضغط «اشطبها»',
    coachKeep: 'لا تناقض؟ تابع، أو اضغط «اعتمد»',
    coachGoOn: 'لا تناقض بعد؟ أضف قطة تجريبية أخرى، أو امسح اللون وجرّب غيرها',
    ghostFree: 'قطة تجريبية: لا تكلّف سمكة',
    howToPlay: 'طريقة اللعب',
    diffMedium: 'متوسط',
    diffHard: 'صعب',
    diffExpert: 'خبير',
    vibrate: 'الاهتزاز',
    time: 'الوقت',
    rewardsLabel: 'مكافآت',
    calm: 'حركة أقل',
    patterns: 'أنماط المناطق',
    cellEmpty: 'صف {r}، عمود {c}: فارغة',
    cellX: 'صف {r}، عمود {c}: ×',
    cellCat: 'صف {r}، عمود {c}: قطة',
    cellTest: 'صف {r}، عمود {c}: علامة تجريبية',
  },
  en: {
    title: 'Cat Grid',
    privacy: 'Privacy',
    support: 'Support',
    level: 'Level',
    points: 'Points',
    ruleColor: 'One cat per color',
    ruleLine: 'One cat per row and column',
    ruleTouch: "Cats can't touch",
    howTo: 'Tap once for ×, double-tap for a cat',
    play: 'Play',
    won: 'Well done!',
    levelDone: 'Level {n} complete!',
    next: 'Next level',
    lost: 'Out of fish',
    left: 'Left',
    getFish: 'Get 3 fish',
    retry: 'Retry',
    daily: 'Daily challenge',
    dailyShort: 'Daily',
    dailyDone: "Today's challenge done!",
    streak: 'day streak',
    home: 'Home',
    settings: 'Settings',
    language: 'Language',
    reset: 'Reset progress',
    close: 'Close',
    back: 'Back',
    powerCat: 'Place a cat',
    powerBulb: 'Hint',
    powerMouse: 'Mouse clears mistakes',
    fishLeft: 'Fish left',
    inks: 'Marking colours',
    inkPen: 'White pen',
    inkTest: 'Test colour',
    undo: 'Undo',
    eraseInk: 'Erase this colour',
    contradictionShort: 'Impossible!',
    noRoom: 'No room left!',
    inkKeep: 'Keep ✓',
    inkCrossOut: 'Cross out ✕',
    inkIdle: 'Double-tap = test cat',
    sound: 'Sound',
    music: 'Music',
    petCat: 'Pet the cat',
    resetAsk: 'Reset all progress? Your level, points, streak and power-ups will be lost.',
    resetYes: 'Yes, reset',
    cancel: 'Cancel',
    diffEasy: 'Easy',
    tipTap: 'Tap here for ✕: no cat can go here',
    autoCheckOn: 'Auto-cross helper · first 5 levels',
    grownCat: 'You’re a big cat now!',
    grownCatBody: 'The helping paws have retired. From now on, tap to cross out cells yourself. You’ve got this, whiskers!',
    tipCat: 'Double-tap here: this cell must be a cat',
    techSingle: 'Last cell: this group has one open cell left',
    techConfine: 'Confine: this group fits inside these lines, so cross out the rest',
    techSqueeze: 'Squeeze: a cat here would wipe out a whole group',
    coachPick: 'Pick a colour to test an idea',
    coachGhost: 'Double-tap for a test cat',
    coachCrossOut: 'Red? The idea fails: tap “Cross out”',
    coachKeep: 'No clash? Keep going, or tap “Keep”',
    coachGoOn: 'No clash yet? Add another test cat, or erase the colour and try another',
    ghostFree: 'Test cat: costs no fish',
    howToPlay: 'How to play',
    diffMedium: 'Medium',
    diffHard: 'Hard',
    diffExpert: 'Expert',
    vibrate: 'Vibration',
    time: 'Time',
    rewardsLabel: 'Rewards',
    calm: 'Reduce motion',
    patterns: 'Region patterns',
    cellEmpty: 'Row {r}, column {c}: empty',
    cellX: 'Row {r}, column {c}: ×',
    cellCat: 'Row {r}, column {c}: cat',
    cellTest: 'Row {r}, column {c}: test mark',
  },
} as const

/**
 * Phrases that change with a count, one per plural category of the language
 * (Arabic has six: zero, one, two, few, many, other; English two).
 */
const plurals = {
  ar: {
    regionOpen: {
      zero: 'المنطقة {n}: لا خانات مفتوحة',
      one: 'المنطقة {n}: خانة مفتوحة واحدة',
      two: 'المنطقة {n}: خانتان مفتوحتان',
      few: 'المنطقة {n}: {k} خانات مفتوحة',
      many: 'المنطقة {n}: {k} خانة مفتوحة',
      other: 'المنطقة {n}: {k} خانة مفتوحة',
    },
  },
  en: {
    regionOpen: {
      one: 'Region {n}: {k} open cell',
      other: 'Region {n}: {k} open cells',
    },
  },
} as const

export type MessageKey = keyof (typeof messages)['en']

export const t = (key: MessageKey): string => messages[progress.lang][key]

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))

/** `t` with its `{name}` placeholders filled in. */
export const tf = (key: MessageKey, vars: Record<string, string | number>): string => fill(t(key), vars)

/** A count phrase in the right plural form for `count`, placeholders filled in. */
export const tp = (key: keyof (typeof plurals)['en'], count: number, vars: Record<string, string | number>): string => {
  const forms: Record<string, string> = plurals[progress.lang][key]
  const form = forms[new Intl.PluralRules(progress.lang).select(count)] ?? forms.other
  return fill(form, vars)
}

watchEffect(() => {
  // No page to set outside a browser (unit tests).
  if (typeof document === 'undefined') return
  document.documentElement.lang = progress.lang
  document.documentElement.dir = progress.lang === 'ar' ? 'rtl' : 'ltr'
})
