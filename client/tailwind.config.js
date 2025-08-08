/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Here we define our custom color palette
      colors: {
        'background': '#24283b', // Dark, desaturated teal/charcoal
        'surface': '#4F4242',    // Warm, dark brown for cards/sidebar
        'accent': '#E64833',     // Vibrant burnt orange-red for highlights
        'text-primary': '#FBE9D0',  // Soft, warm off-white for main text
        'text-secondary': '#90AEAD', // Dusty teal for muted text
      },
      // We can also define a custom font family if we want
      fontFamily: {
        // 'sans' will be the default font
        sans: ['Inter', 'sans-serif'],
        // 'mono' will be used for code-like text
        mono: ['"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
