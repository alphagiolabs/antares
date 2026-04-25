/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mc: {
          canvas: 'var(--mc-canvas)',
          lifted: 'var(--mc-lifted)',
          white: 'var(--mc-white)',
          bone: 'var(--mc-bone)',
          ink: 'var(--mc-ink)',
          charcoal: 'var(--mc-charcoal)',
          slate: 'var(--mc-slate)',
          granite: 'var(--mc-granite)',
          graphite: 'var(--mc-graphite)',
          dust: 'var(--mc-dust)',
          signal: 'var(--mc-signal)',
          signalLight: 'var(--mc-signalLight)',
          clay: 'var(--mc-clay)',
          linkBlue: 'var(--mc-linkBlue)',
          red: 'var(--mc-red)',
          yellow: 'var(--mc-yellow)',
          ghost: 'var(--mc-ghost)',
        },
        dark: {
          base: '#0A0A0A',
          surface: '#111111',
          elevated: '#1A1A1A',
          input: '#222222',
        },
        txt: {
          primary: '#FFFFFF',
          secondary: '#A0A0A0',
          muted: '#666666',
        },
        accent: {
          orange: '#FF6B2C',
          'orange-hover': '#FF8F5E',
          'orange-glow': 'rgba(255, 107, 44, 0.3)',
          blue: '#3B82F6',
          green: '#22C55E',
          red: '#EF4444',
          yellow: '#F59E0B',
        },
        bdr: {
          subtle: '#222222',
          medium: '#333333',
          active: '#FF6B2C',
        },
      },
      fontFamily: {
        mark: ['Sofia Sans', 'Inter', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'pill': '999px',
        'btn': '12px',
        'card': '16px',
        'chip': '24px',
        'sm': '6px',
      },
      boxShadow: {
        'nav': 'rgba(0, 0, 0, 0.2) 0px 4px 24px 0px',
        'card': 'rgba(0, 0, 0, 0.3) 0px 24px 48px 0px',
        'elevated': 'rgba(0, 0, 0, 0.5) 0px 70px 110px 0px',
        'glow': '0 0 20px rgba(255, 107, 44, 0.3)',
      },
      letterSpacing: {
        'display': '-0.02em',
        'tight': '-0.03em',
        'eyebrow': '0.04em',
      },
      lineHeight: {
        'display': '1',
        'tight': '1.2',
        'body': '1.4',
      }
    },
  },
  plugins: [],
}
