export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://shoo.dev",
      jwks: "https://shoo.dev/.well-known/jwks.json",
      algorithm: "ES256" as const,
    },
  ],
};
