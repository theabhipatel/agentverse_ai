import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

export const THEME_STORAGE_KEY = 'agentverse-theme'

/**
 * next-themes toggles the `dark` class on <html>, which is what the
 * dark variant in index.css hooks into. Sonner reads the same context.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </NextThemesProvider>
  )
}
