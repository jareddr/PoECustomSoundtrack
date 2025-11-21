/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        'exocet': ['Exocet Light', 'sans-serif'],
      },
      colors: {
        'd2-button': '#858480',
        'd2-button-hover': '#9e998b',
        'd2-button-border': '#333029',
        'd2-text': '#ddd',
        'd2-text-hover': '#aaa',
        'd2-text-dark': '#11120d',
        'd2-primary': '#0ba5a5',
        'd2-secondary': '#d82f2f',
        'd2-update-bg': 'rgba(70, 150, 150, 0.9)',
        // New color scheme for modals/overlays/settings/track forms
        'primary': {
          100: '#FF6B6B',
          200: '#dd4d51',
          300: '#8f001a',
        },
        'accent': {
          100: '#00FFFF',
          200: '#00999b',
        },
        'text': {
          100: '#FFFFFF',
          200: '#e0e0e0',
        },
        'bg': {
          100: '#0F0F0F',
          200: '#1f1f1f',
          300: '#353535',
        },
      },
      borderRadius: {
        'd2': '4px',
      },
    },
  },
  plugins: [],
};

