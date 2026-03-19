import { z } from "zod";

// ─── Primitive input schemas ────────────────────────────────────────────────

export const ShopifyApiInputSchema = z.object({
  method: z.enum(["graphql", "rest_get", "rest_post", "rest_put", "rest_delete"]),
  query: z.string().min(1),
  variables: z.record(z.unknown()).optional(),
});

export const XeroApiInputSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  path: z.string().min(1),
  body: z.record(z.unknown()).optional(),
});

export const RunCodeInputSchema = z.object({
  code: z.string().min(1),
});

export const WebSearchInputSchema = z.object({
  action: z.enum(["search", "fetch_url"]),
  query: z.string().min(1),
});

export const GenerateFileInputSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
  content_type: z.enum(["text/plain", "text/csv", "application/json", "text/markdown"]),
});

export const SendCommsInputSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
});

export const MemoryInputSchema = z.object({
  action: z.enum(["read", "write"]),
  query: z.string().min(1),
  category: z
    .enum(["preference", "pattern", "contact", "decision", "observation", "workflow"])
    .optional(),
});

// ─── WhatsApp webhook schemas ────────────────────────────────────────────────

export const WhatsAppTextMessageSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            contacts: z
              .array(
                z.object({
                  profile: z.object({ name: z.string() }),
                  wa_id: z.string(),
                })
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  interactive: z
                    .object({
                      type: z.string(),
                      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
                      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.enum(["sent", "delivered", "read", "failed"]),
                  timestamp: z.string(),
                  recipient_id: z.string(),
                })
              )
              .optional(),
          }),
          field: z.literal("messages"),
        })
      ),
    })
  ),
});

// ─── Shopify webhook schemas ─────────────────────────────────────────────────

export const ShopifyOAuthCallbackSchema = z.object({
  shop: z.string(),
  code: z.string(),
  state: z.string(),
  hmac: z.string(),
  timestamp: z.string(),
});

// ─── Dashboard API schemas ───────────────────────────────────────────────────

export const UpdatePreferencesSchema = z.object({
  morningBriefTime: z.string().optional(), // "08:00" local time
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
});

// ─── Inferred types (only those not already in types.ts) ─────────────────────

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppTextMessageSchema>;
export type UpdatePreferences = z.infer<typeof UpdatePreferencesSchema>;
