'use client'
import { useState, useEffect } from 'react'
import { type Locale, translations, type Translations } from './i18n'

const COOKIE = 'peddlers_lang'
const EVENT = 'peddlers_lang_change'

export function saveLocale(locale: Locale) {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)
  document.cookie = `${COOKIE}=${locale}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

export function getStoredLocale(): Locale {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.split('; ').find(r => r.startsWith(`${COOKIE}=`))
  const val = match?.split('=')[1]
  return (val === 'es') ? 'es' : 'en'
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    setLocaleState(getStoredLocale())
    function handleLocaleChange(event: Event) {
      const nextLocale = (event as CustomEvent<Locale>).detail
      if (nextLocale === 'en' || nextLocale === 'es') {
        setLocaleState(nextLocale)
      }
    }
    window.addEventListener(EVENT, handleLocaleChange)
    return () => window.removeEventListener(EVENT, handleLocaleChange)
  }, [])

  function setLocale(l: Locale) {
    saveLocale(l)
    setLocaleState(l)
    window.dispatchEvent(new CustomEvent(EVENT, { detail: l }))
  }

  const t: Translations = translations[locale]
  return { locale, setLocale, t }
}
