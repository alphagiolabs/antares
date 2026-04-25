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
        }
      },
      fontFamily: {
        mark: ['Sofia Sans', 'Inter', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        'pill': '999px',
        'btn': '20px',
        'card': '40px',
        'chip': '24px',
        'sm': '6px',
      },
      boxShadow: {
        'nav': 'rgba(0, 0, 0, 0.04) 0px 4px 24px 0px',
        'card': 'rgba(0, 0, 0, 0.08) 0px 24px 48px 0px',
        'elevated': 'rgba(0, 0, 0, 0.25) 0px 70px 110px 0px',
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
