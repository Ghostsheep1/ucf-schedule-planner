import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'selector',
	theme: {
		colors: {
			/* general themes */
			transparent: 'transparent',
			current: 'currentColor',
			white: '#ffffff',
			black: '#000000',
			orange: '#FFC904',
			lightOrange: '#FFE68A',
			midGray: '#888888',

			/* light mode themes */
			bgLight: '#F7F8FA',
			bgSecondaryLight: '#FFFFFF',
			textLight: '#111827',
			divBorderLight: '#E4E8F0',
			outlineLight: '#9AA6BA',
			secCodesLight: '#667085',
			hoverLight: '#EEF2F7',

			/* dark mode themes */
			bgDark: '#0B0F17',
			bgSecondaryDark: '#111827',
			textDark: '#E8ECF4',
			divBorderDark: '#253044',
			outlineDark: '#536179',
			secCodesDark: '#8A95AA',
			hoverDark: '#1A2333'
		},
		extend: {
			keyframes: {
				fadeOut: {
					from: { opacity: '1', display: 'visible' },
					to: { opacity: '0', display: 'hidden' }
				}
			},
			animation: {
				fadeOut: 'fadeOut 0.75s forwards'
			}
		}
	},
	plugins: [forms]
};
