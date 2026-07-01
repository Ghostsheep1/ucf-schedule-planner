/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  darkMode: "selector",
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      orange: "#ffc904",
      lightOrange: "#ffdf70",
      midGray: "#888888",
      bgLight: "white",
      bgSecondaryLight: "#EBEBEB",
      textLight: "black",
      divBorderLight: "#F1F1F1",
      outlineLight: "#A2AABD",
      secCodesLight: "#667085",
      hoverLight: "#d8d8d8",
      bgDark: "#151922",
      bgSecondaryDark: "#141721",
      textDark: "#D9DFEA",
      divBorderDark: "#252E3E",
      outlineDark: "#47526A",
      secCodesDark: "#667085",
      hoverDark: "#30374a",
      ucfBlack: "#050505",
      ucfGold: "#ffc904",
      ucfOrange: "#ff7a3d",
      ucfDarkGold: "#c59100"
    },
    extend: {}
  },
  plugins: []
};
