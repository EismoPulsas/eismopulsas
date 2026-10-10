import { NextResponse, type NextRequest } from "next/server";

/**
 * Dev-only CORS for trying the mobile app in a browser (`npx expo start --web`,
 * served from e.g. http://localhost:8081). Native React Native `fetch` is not
 * subject to CORS, so production builds add nothing here. STRUCTURE.md › Part B.
 */
const ENABLED = process.env.NODE_ENV === "development";
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!ENABLED || !origin || !LOOPBACK_ORIGIN.test(origin)) return NextResponse.next();

  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "600" } });
  }

  const response = NextResponse.next();
  for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: ["/api/mobility/:path*", "/api/geocode"],
};
