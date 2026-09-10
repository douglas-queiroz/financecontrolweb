/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e8eaf6',
          100: '#c5cae9',
          200: '#9fa8da',
          300: '#7986cb',
          400: '#5c6bc0',
          500: '#3f51b5',
          600: '#3949ab',
          700: '#303f9f',
          800: '#283593',
          900: '#1a237e',
        },
        surface: '#ffffff',
        'surface-variant': '#f5f5f5',
        success: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          500: '#4caf50',
          600: '#43a047',
          700: '#388e3c',
          800: '#2e7d32',
        },
        warning: {
          50: '#fff8e1',
          100: '#ffecb3',
          500: '#ffb300',
          600: '#ffa000',
          700: '#ff8f00',
          800: '#ff6f00',
        },
        danger: {
          50: '#ffebee',
          100: '#ffcdd2',
          500: '#f44336',
          600: '#e53935',
          700: '#d32f2f',
          800: '#c62828',
        },
      },
      boxShadow: {
        'elevation-1':
          '0 1px 1px 0 rgba(0, 0, 0, 0.14), 0 2px 1px -1px rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.20)',
        'elevation-2':
          '0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 3px 1px -2px rgba(0, 0, 0, 0.12), 0 1px 5px 0 rgba(0, 0, 0, 0.20)',
        'elevation-3':
          '0 3px 4px 0 rgba(0, 0, 0, 0.14), 0 3px 3px -2px rgba(0, 0, 0, 0.12), 0 1px 8px 0 rgba(0, 0, 0, 0.20)',
      },
    },
  },
  plugins: [],
}