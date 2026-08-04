import { createContext, useContext, useState, useEffect } from 'react'
import { translations } from '../i18n/translations'

const LanguageContext = createContext()

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('pl_lang') || 'en')

  // Listen for lang changes triggered by AuthContext on login
  useEffect(() => {
    const handleChange = () => {
      const newLang = localStorage.getItem('pl_lang')
      if (newLang && newLang !== lang) setLang(newLang)
    }
    window.addEventListener('pl_lang_change', handleChange)
    return () => window.removeEventListener('pl_lang_change', handleChange)
  }, [lang])

  const setLanguage = (l) => {
    localStorage.setItem('pl_lang', l)
    setLang(l)
    // Sync to server if user is logged in (fire-and-forget)
    const token = localStorage.getItem('pl_token')
    if (token) {
      fetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: l }),
      }).catch(() => {})
    }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function useT() {
  const { lang } = useLanguage()
  return translations[lang] || translations.en
}
