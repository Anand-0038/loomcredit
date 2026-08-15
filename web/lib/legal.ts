const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type LegalConfig = {
  entityName: string | null;
  contactEmail: string | null;
  entityAddress: string | null;
  governingLaw: string | null;
  effectiveDate: string | null;
  isPublishable: boolean;
};

function configuredValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidDate(value: string | null): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function getLegalConfig(
  env: Record<string, string | undefined> = process.env,
): LegalConfig {
  const contactEmail = configuredValue(env.LEGAL_CONTACT_EMAIL);
  const effectiveDate = configuredValue(env.LEGAL_EFFECTIVE_DATE);
  const validEffectiveDate = isValidDate(effectiveDate);

  return {
    entityName: configuredValue(env.LEGAL_ENTITY_NAME),
    contactEmail:
      contactEmail && EMAIL_PATTERN.test(contactEmail) ? contactEmail : null,
    entityAddress: configuredValue(env.LEGAL_ENTITY_ADDRESS),
    governingLaw: configuredValue(env.LEGAL_GOVERNING_LAW),
    effectiveDate: validEffectiveDate ? effectiveDate : null,
    isPublishable: Boolean(
      configuredValue(env.LEGAL_ENTITY_NAME) &&
      contactEmail &&
      EMAIL_PATTERN.test(contactEmail) &&
      configuredValue(env.LEGAL_ENTITY_ADDRESS) &&
      configuredValue(env.LEGAL_GOVERNING_LAW) &&
      validEffectiveDate,
    ),
  };
}

export function formatLegalDate(value: string | null): string {
  if (!isValidDate(value)) return "Not set";
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export function legalContactHref(email: string | null): string | null {
  return email ? `mailto:${email}` : null;
}
