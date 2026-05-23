import React, { createContext, useContext, useState, useEffect } from 'react';

export type FontSize = 'small' | 'medium' | 'large';

interface ThemeContextType {
  isDark: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
}

const FONT_SIZE_PX: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('theme-mode');
    if (stored) return stored === 'dark';
    if (typeof window !== 'undefined') return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return false;
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    return (localStorage.getItem('a11y-font-size') as FontSize) || 'medium';
  });

  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    return localStorage.getItem('a11y-reduce-motion') === 'true';
  });

  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    return localStorage.getItem('a11y-high-contrast') === 'true';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) html.classList.add('dark');
    else html.classList.remove('dark');
    localStorage.setItem('theme-mode', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_PX[fontSize];
    localStorage.setItem('a11y-font-size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    const html = document.documentElement;
    if (reduceMotion) html.classList.add('reduce-motion');
    else html.classList.remove('reduce-motion');
    localStorage.setItem('a11y-reduce-motion', reduceMotion ? 'true' : 'false');
  }, [reduceMotion]);

  useEffect(() => {
    const html = document.documentElement;
    if (highContrast) html.classList.add('high-contrast');
    else html.classList.remove('high-contrast');
    localStorage.setItem('a11y-high-contrast', highContrast ? 'true' : 'false');
  }, [highContrast]);

  const toggleDarkMode = () => setIsDark(prev => !prev);
  const setDarkMode = (value: boolean) => setIsDark(value);
  const setFontSize = (size: FontSize) => setFontSizeState(size);
  const setReduceMotion = (v: boolean) => setReduceMotionState(v);
  const setHighContrast = (v: boolean) => setHighContrastState(v);

  return (
    <ThemeContext.Provider value={{ isDark, toggleDarkMode, setDarkMode, fontSize, setFontSize, reduceMotion, setReduceMotion, highContrast, setHighContrast }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
