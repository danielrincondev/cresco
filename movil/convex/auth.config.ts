import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Set this deployment variable to the Frontend API URL shown by Clerk's
      // Convex integration, for example https://example.clerk.accounts.dev.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
