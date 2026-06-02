/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ocean: {
          50: '#e8f0f8',
          100: '#c5d9ed',
          200: '#9ebde0',
          300: '#6d9bd0',
          400: '#4a80c2',
          500: '#2d5fa8',
          600: '#1a3f6e',
          700: '#1a2a3a',
          800: '#111d2b',
          900: '#0a1219',
        },
        gold: {
          50: '#fdf6e3',
          100: '#f8e8b8',
          200: '#f0d88a',
          300: '#e5c35c',
          400: '#d4a838',
          500: '#c9a96e',
          600: '#b08d3a',
          700: '#8a6c2a',
          800: '#654d1e',
          900: '#3f3012',
        },
        parchment: {
          50: '#faf6ed',
          100: '#f4e4c1',
          200: '#edd4a0',
          300: '#e0be78',
          400: '#d0a050',
          500: '#b8863a',
          600: '#96692c',
          700: '#704e22',
          800: '#4d3518',
          900: '#2b1e0e',
        },
        danger: {
          50: '#fce8e4',
          100: '#f5c4ba',
          200: '#e89a8a',
          300: '#d46a55',
          400: '#b8432e',
          500: '#8b2500',
          600: '#6e1d00',
          700: '#521600',
          800: '#380f00',
          900: '#1f0900',
        },
        safe: {
          50: '#e8f5e4',
          100: '#c4e4ba',
          200: '#9ad08a',
          300: '#6ab855',
          400: '#4a9e38',
          500: '#2d5a27',
          600: '#23481e',
          700: '#1a3616',
          800: '#12240e',
          900: '#0a1307',
        },
      },
      fontFamily: {
        pirate: ['"Pirata One"', 'cursive'],
        serif: ['"Crimson Text"', 'Georgia', 'serif'],
      },
      animation: {
        'ship-sway': 'shipSway 3s ease-in-out infinite',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'fog-clear': 'fogClear 2s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.4s ease-out forwards',
        'slide-in-right': 'slideInRight 0.4s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'shimmer': 'shimmer 2s linear infinite',
        'slide-in-right': 'slideInRightToast 0.4s ease-out forwards',
        'slide-out-right': 'slideOutRightToast 0.4s ease-in forwards',
        'fade-in-scale': 'fadeInScale 0.3s ease-out forwards',
      },
      keyframes: {
        shipSway: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(201,169,110,0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(201,169,110,0.8)' },
        },
        fogClear: {
          '0%': { opacity: '0', filter: 'blur(10px)' },
          '100%': { opacity: '1', filter: 'blur(0px)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeInUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRightToast: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideOutRightToast: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        fadeInScale: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
