import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Cyber Glassmorphism custom palette
        cyber: {
          cyan:   'hsl(189 94% 55%)',     // #06b6d4
          purple: 'hsl(258 90% 66%)',     // #a855f7
          pink:   'hsl(330 81% 60%)',     // #ec4899
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'cyber-gradient': 'linear-gradient(135deg, #0f0c29 0%, #1a1147 50%, #302b63 100%)',
        'glow-cyan':     'radial-gradient(circle at 50% 50%, rgba(6,182,212,0.15), transparent 70%)',
        'glow-purple':   'radial-gradient(circle at 50% 50%, rgba(168,85,247,0.15), transparent 70%)',
      },
      boxShadow: {
        'glass':       '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glow-cyan':   '0 0 20px rgba(6, 182, 212, 0.5)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.5)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%':      { opacity: '1' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'glow-pulse':    'glow-pulse 3s ease-in-out infinite',
        'gradient-shift':'gradient-shift 8s ease infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
