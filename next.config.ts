import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Report-Fonts (Offertenvergleich) werden zur Laufzeit über
  // process.cwd() geladen – fürs Vercel-Bundling der Report-Route
  // explizit mitverfolgen.
  outputFileTracingIncludes: {
    "/p/[projectId]/api/ov/report": [
      "./features/offertenvergleich/report/fonts/**",
    ],
  },
};

export default nextConfig;
