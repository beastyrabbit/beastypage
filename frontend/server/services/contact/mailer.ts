import "server-only";

import type { ContactSource } from "@/app/kontakt/source";

export class ContactMailUnavailableError extends Error {}

export class ContactMailDeliveryError extends Error {
  constructor(readonly status: number) {
    super("Contact mail delivery failed");
  }
}

type ContactMessage = {
  name: string;
  email: string;
  message: string;
  source?: ContactSource;
};

export async function sendContactMail(input: ContactMessage): Promise<void> {
  const key = process.env.CONTACT_RESEND_API_KEY;
  if (!key) throw new ContactMailUnavailableError();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from: "BeastyPage Kontaktformular <kontakt-formular@heerlab.com>",
      to: ["kontakt@heerlab.com"],
      reply_to: input.email,
      subject: `${input.source ? `[${input.source}] ` : ""}Kontaktformular: ${input.name}`,
      text: [
        `Name: ${input.name}`,
        `E-Mail: ${input.email}`,
        ...(input.source ? [`Quelle: ${input.source}`] : []),
        `Zeitpunkt: ${new Date().toISOString()}`,
        "",
        "Nachricht:",
        input.message,
      ].join("\n"),
    }),
  });
  // Provider response bodies may contain personal data. Never read or log them.
  void response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new ContactMailDeliveryError(response.status);
}
