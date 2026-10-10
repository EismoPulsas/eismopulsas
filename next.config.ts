import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The planner reads its timetable and map layers from disk at runtime.
  outputFileTracingIncludes: {
    "/api/plan": ["./data/transit.json.gz", "./public/data/bus-lanes.json", "./public/data/parking.json"],
    "/api/geocode": ["./data/transit.json.gz", "./public/data/bus-lanes.json"],
  },
};

export default nextConfig;
