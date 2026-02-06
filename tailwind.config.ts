import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#ECE8E1",
        card: "#F5F2EC",
        ink: "#1C1917",
        faded: "#918A82",
        rule: "#D4CFC7",
        blush: "#E05170",
        ocean: "#3356D0",
        sage: "#5A9668",
      },
      keyframes: {
        slideUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        stamp: {
          "0%": { transform: "scale(2.5)", opacity: "0" },
          "40%": { transform: "scale(1)", opacity: "1" },
          "70%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeSlideIn: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "slide-up": "slideUp 0.2s ease-out",
        stamp: "stamp 0.4s ease-out forwards",
        "fade-slide-in": "fadeSlideIn 0.3s ease-out both",
      },
      fontFamily: {
        sans: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
