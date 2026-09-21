import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Tailwind's automatic config search walks UP from process.cwd(), which is
// the repo root (not this frontend/ directory) when running `next build
// frontend` or the custom server.js from the repo root. Point it at the
// config file explicitly instead of relying on auto-discovery.
const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  plugins: {
    tailwindcss: { config: join(__dirname, "tailwind.config.js") },
    autoprefixer: {},
  },
};

export default config;
