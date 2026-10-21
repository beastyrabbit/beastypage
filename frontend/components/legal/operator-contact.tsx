import { type LegalLanguage, operator } from "@/lib/legal/operator";

export function OperatorAddress({ lang }: { lang: LegalLanguage }) {
  return (
    <address className="not-italic">
      {operator.name}
      <br />
      {operator.addressLines.map((line) => (
        <span key={line}>
          {line}
          <br />
        </span>
      ))}
      {operator.country[lang]}
    </address>
  );
}

export function LegalEmail({ kind }: { kind: "privacy" | "impressum" }) {
  const email =
    kind === "privacy" ? operator.privacyEmail : operator.impressumEmail;
  return <a href={`mailto:${email}`}>{email}</a>;
}

export function ContactFormLink() {
  return <a href={operator.contactFormUrl}>beastyrabbit.com/kontakt</a>;
}
