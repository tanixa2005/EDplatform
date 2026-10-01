import type { Config } from 'tailwindcss';
import path from 'path';

const config: Config = {
  darkMode: ['class'],
  content: [
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx,mdx}').replace(/\\/g, '/'),
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './apps/frontend/src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './apps/frontend/src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './apps/frontend/src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
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
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        brand: {
          50: '#FDE8E7',
          100: '#FCD4D2',
          200: '#FAAAAB',
          300: '#F67B7D',
          400: '#F05250',
          500: '#E53935', // Confident deep red
          600: '#D32F2F',
          700: '#B91C1C', // Secondary red
          800: '#991B1B',
          900: '#7F1D1D'
        },
        ivory: {
          50: '#FFFFFF',
          100: '#FFFDF8', // Primary background
          200: '#FAF7F0',
          300: '#F4EFE6',
          400: '#EAE3D5'
        },
        cream: {
          DEFAULT: '#FFF3CD',
          dark: '#FFE69C'
        },
        ink: {
          DEFAULT: '#111111',
          light: '#2A2A2A',
          muted: '#666666'
        }
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      fontFamily: {
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif'
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

export default config;
