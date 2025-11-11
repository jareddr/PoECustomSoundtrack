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
      },
      borderRadius: {
        'd2': '4px',
      },
    },
  },
  plugins: [],
};

