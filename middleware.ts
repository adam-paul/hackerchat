import { authMiddleware } from "@clerk/nextjs";
 
// See https://clerk.com/docs/references/nextjs/auth-middleware
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
  ],
});
 
export const config = {
  // Match all request paths except for the ones starting with:
  // - _next/static (static files)
  // - _next/image (image optimization files)
  // - favicon.ico (favicon file)
  // - public folder
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
