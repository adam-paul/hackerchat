// src/middleware.ts

import { authMiddleware } from "@clerk/nextjs";
 
export default authMiddleware({
  // Public routes that don't require authentication
  publicRoutes: [
    "/",              // Landing page
    "/api/webhook",   // Clerk webhooks
    "/api/health",    // Health check endpoint
  ],
  
  // Routes that can be accessed while signed out
  ignoredRoutes: [
    "/api/public",    // Public API endpoints
  ]
});
 
export const config = {
  matcher: [
    // Exclude files with extensions (.js, .css, etc)
    "/((?!.*\\..*|_next).*)",
    // Exclude specific Next.js paths
    "/(api|trpc)(.*)",
  ],
};
