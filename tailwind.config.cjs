/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // './index.html',
    // './js/**/*.js',
     "./src/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0d0c1d',
        'card-bg': '#1a182e',
        'orange-400': '#f97316',
        'yellow-400': '#facc15',
        'gray-600': '#4b5563',
        'green-500': '#10b981',
        'red-500': '#ef4444',
        'yellow-500': '#f59e0b',
        'blue-500': '#3b82f6',
        'gray-300': '#d1d5db',
        'gray-400': '#9ca3af',
        'gray-700': '#374151',
      },
      backdropFilter: {
        'blur-12': 'blur(12px)',
      },
      boxShadow: {
        'glow': '0 0 12px #facc15',
        'card': '0 2px 4px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.glass': {
          'backdrop-filter': 'blur(12px)',
          'background': 'rgba(26, 24, 46, 0.05)',
          'border': '1px solid rgba(255, 255, 255, 0.1)',
        },
      });
    },
  ],
};