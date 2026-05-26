import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "oklch(93.5% 0.018 78 / <alpha-value>)",
        card: "oklch(97% 0.014 78 / <alpha-value>)",
        ink: "oklch(24% 0.018 63 / <alpha-value>)",
        faded: "oklch(59% 0.018 63 / <alpha-value>)",
        rule: "oklch(84% 0.016 74 / <alpha-value>)",
        blush: "oklch(62% 0.16 14 / <alpha-value>)",
        ocean: "oklch(48% 0.17 265 / <alpha-value>)",
        sage: "oklch(58% 0.095 145 / <alpha-value>)",
        amber: "oklch(69% 0.14 78 / <alpha-value>)",
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
