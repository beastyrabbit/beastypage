export type LegalLanguage = "de" | "en";

export const operator = {
  name: "Tobias Heer",
  addressLines: [
    "c/o Impressumservice Dein-Impressum",
    "Stettiner Str. 41",
    "35410 Hungen",
  ],
  country: { de: "Deutschland", en: "Germany" },
  impressumEmail: "impressum-beastyrabbit@heerlab.com",
  privacyEmail: "datenschutz-beastyrabbit@heerlab.com",
  contactFormUrl: "https://beastyrabbit.com/kontakt?from=beastyrabbit",
  slug: "beastyrabbit",
} as const;
