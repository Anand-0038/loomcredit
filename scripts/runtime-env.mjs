const PRIVATE_ENV_NAME =
  /(?:PRIVATE_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|SECRET|PASSWORD|DATABASE_URL|ENCRYPTION_KEY)/;

export function withoutPrivateRuntimeSecrets(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) =>
        name.startsWith("NEXT_PUBLIC_") || !PRIVATE_ENV_NAME.test(name),
    ),
  );
}
