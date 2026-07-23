const requiredKeys = process.argv.slice(2);
const missingKeys = requiredKeys.filter((key) => !process.env[key]?.trim());

const convexDeployment = process.env.CONVEX_DEPLOYMENT?.trim();
const malformedKeys =
  convexDeployment && !/^(dev|prod):[a-z0-9-]+$/i.test(convexDeployment)
    ? ["CONVEX_DEPLOYMENT"]
    : [];

if (missingKeys.length || malformedKeys.length) {
  if (missingKeys.length) {
    console.error(`Missing Infisical keys: ${missingKeys.join(", ")}`);
  }
  if (malformedKeys.length) {
    console.error(`Malformed Infisical keys: ${malformedKeys.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Infisical environment ready (${requiredKeys.length} required keys).`,
);
