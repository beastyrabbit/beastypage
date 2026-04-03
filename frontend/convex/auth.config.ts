import type { AuthConfig } from "convex/server";

const jwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!jwtIssuerDomain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN must be defined in the Convex deployment environment.",
  );
}

export default {
  providers: [
    {
      domain: jwtIssuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
