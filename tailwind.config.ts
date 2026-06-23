import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ucf: {
          black: "#050505",
          gold: "#ffc904",
          darkGold: "#c59100",
          ink: "#161616",
          paper: "#fffdf4"
        }
      },
      boxShadow: {
        planner: "0 18px 50px rgba(0,0,0,0.14)"
      }
    }
  },
  plugins: []
};

export default config;
