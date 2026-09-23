const { join } = require("path");

/** @type {import('tailwindcss').Config} */
// Use absolute paths (relative to THIS file) so content globs resolve
// correctly regardless of process.cwd() — see docs/decision-ledger.md for
// the frontend/backend/shared folder split that makes cwd != this directory.
module.exports = {
  content: [
    join(__dirname, "app/**/*.{js,ts,jsx,tsx,mdx}"),
    join(__dirname, "components/**/*.{js,ts,jsx,tsx,mdx}"),
    join(__dirname, "hooks/**/*.{js,ts,jsx,tsx,mdx}"),
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
      },
    },
  },
  plugins: [],
};
