    /** @type {import('tailwindcss').Config} */
    export default {
      content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
      ],
      theme: {
        extend: {
          colors: {
            'background': '#24283b',
            'surface': '#4F4242',
            'accent': '#E64833',
            'text-primary': '#FBE9D0',
            'text-secondary': '#90AEAD',
          },
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['"Fira Code"', 'monospace'],
          }
        },
      },
      plugins: [],
    }
    