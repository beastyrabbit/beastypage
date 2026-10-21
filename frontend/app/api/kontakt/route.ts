import { z } from "zod";
import {
  RequestBodyTooLargeError,
  readRequestBody,
} from "@/app/api/_lib/request-body";
import { contactSource } from "@/app/kontakt/source";
import {
  ContactMailDeliveryError,
  ContactMailUnavailableError,
  sendContactMail,
} from "@/server/services/contact/mailer";
import {
  acceptContactSubmission,
  contactClientIp,
} from "@/server/services/contact/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  name: z
    .string()
    .refine((value) => !/[\r\n]/.test(value))
    .trim()
    .min(1)
    .max(100),
  email: z
    .string()
    .refine((value) => !/[\r\n]/.test(value))
    .trim()
    .max(254)
    .pipe(z.email()),
  message: z.string().trim().min(10).max(5000),
  website: z.string().optional().default(""),
  source: z.unknown().transform(contactSource).optional(),
});

const MAIL_ERROR =
  "Ihre Nachricht konnte nicht gesendet werden. Bitte schreiben Sie stattdessen an impressum-beastyrabbit@heerlab.com.\nYour message could not be sent. Please email impressum-beastyrabbit@heerlab.com instead.";

function respond(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "600" } : {}),
    },
  });
}

export async function POST(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return respond(
      {
        error:
          "Bitte senden Sie das Formular als JSON.\nPlease submit the form as JSON.",
      },
      415,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await readRequestBody(request, 16 * 1024));
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? respond(
          { error: "Die Nachricht ist zu groß.\nThe message is too large." },
          413,
        )
      : respond(
          {
            error:
              "Die Anfrage enthält kein gültiges JSON.\nThe request does not contain valid JSON.",
          },
          400,
        );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return respond(
      {
        error:
          "Bitte prüfen Sie Ihre Angaben: Name (1–100 Zeichen), gültige E-Mail-Adresse (höchstens 254 Zeichen) und Nachricht (10–5000 Zeichen).\nPlease check your details: name (1–100 characters), valid email address (up to 254 characters), and message (10–5000 characters).",
      },
      400,
    );
  }
  if (parsed.data.website) return respond({ success: true });

  const reservation = acceptContactSubmission(contactClientIp(request.headers));
  if (!reservation) {
    return respond(
      {
        error:
          "Zu viele Anfragen. Bitte versuchen Sie es in 10 Minuten erneut.\nToo many requests. Please try again in 10 minutes.",
      },
      429,
    );
  }

  try {
    await sendContactMail(parsed.data);
    return respond({ success: true });
  } catch (error) {
    reservation.release();
    const unavailable = error instanceof ContactMailUnavailableError;
    const deliveryStatus =
      error instanceof ContactMailDeliveryError ? error.status : "error";
    // Never log provider errors: their messages can contain mail or credentials.
    console.error(
      unavailable
        ? "Contact mail unavailable (configuration)"
        : `Contact mail failed (resend_${deliveryStatus})`,
    );
    return respond({ error: MAIL_ERROR }, unavailable ? 503 : 500);
  }
}
