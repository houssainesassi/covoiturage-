import { z } from "zod";
import { normalizeTunisianPhone } from "./phone";

// z.guid(): any 8-4-4-4-12 hex id. z.uuid() enforces RFC version bits and rejects md5()::uuid ids (demo data).
const uuid = z.guid();
const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const passwordSchema = z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/\d/);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
});

/**
 * Sign-up form: a name, a password and ONE identifier, the phone number (SMS code)
 * or the email (email code). Accepting the terms is stated next to the button.
 */
export const registerSchema = (method: "email" | "phone") =>
  z.object({
    fullName: trimmed(100).min(2),
    email: method === "email" ? z.string().trim().toLowerCase().email() : z.undefined(),
    phone: method === "phone" ? z.string().trim().min(1).max(20) : z.undefined(),
    password: passwordSchema,
  });

/** Required Tunisian phone number, normalized to E.164 (+216XXXXXXXX). */
export const phoneField = z
  .string({ error: "phone_required" })
  .trim()
  .max(20, { error: "invalid_phone" })
  .transform((v, ctx) => {
    if (!v) {
      ctx.addIssue({ code: "custom", message: "phone_required" });
      return z.NEVER;
    }
    const n = normalizeTunisianPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return z.NEVER;
    }
    return n;
  });

export const completeProfileSchema = z.object({
  fullName: trimmed(100).min(2),
  phone: phoneField,
  avatarPath: z.string().trim().max(200).optional().transform((v) => (v ? v : null)),
});

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const tripSchema = z.object({
  originId: uuid,
  destinationId: uuid,
  originAddress: trimmed(200).min(2),
  destinationAddress: trimmed(200).min(2),
  originLat: coord(30, 38),
  originLng: coord(7, 12.5),
  destinationLat: coord(30, 38),
  destinationLng: coord(7, 12.5),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  seats: z.coerce.number().int().min(1).max(8),
  price: z.coerce.number().min(1).max(500),
  vehicleId: z.string().optional(),
  luggage: z.enum(["none", "small", "medium", "large"]),
  description: optionalText(1000),
  distanceKm: z.preprocess((x) => (x === "" ? undefined : x), z.coerce.number().min(0).max(2000).optional()).catch(undefined),
  durationMin: z.preprocess((x) => (x === "" ? undefined : x), z.coerce.number().int().min(0).max(3000).optional()).catch(undefined),
});

export const vehicleSchema = z.object({
  type: z.preprocess((v) => v || null, z.enum(["sedan", "hatchback", "suv", "van", "minibus", "pickup", "other"]).nullable()),
  brand: optionalText(50),
  model: trimmed(50).min(1),
  color: optionalText(30),
  year: z.coerce.number().int().min(1970).max(new Date().getFullYear() + 1).optional().catch(undefined),
  seats: z.coerce.number().int().min(1).max(8),
  plate: optionalText(20),
});

export const profileSchema = z.object({
  fullName: trimmed(100).min(2),
  phone: phoneField,
  bio: optionalText(500),
  cityId: z.string().optional().transform((v) => (v ? v : null)).pipe(uuid.nullable()),
  dob: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  prefSmoking: z.boolean(),
  prefPets: z.boolean(),
  prefMusic: z.boolean(),
  prefChatty: z.boolean(),
});

export const bookingSchema = z.object({
  tripId: uuid,
  seats: z.coerce.number().int().min(1).max(8),
  message: optionalText(500),
});

export const reviewSchema = z.object({
  tripId: uuid,
  revieweeId: uuid,
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(1000),
});

export const reportSchema = z.object({
  reportedUserId: uuid,
  reason: z.enum(["inappropriate_behavior", "harassment", "fraud", "no_show", "dangerous_driving", "fake_profile", "spam", "other"]),
  details: optionalText(2000),
  tripId: z.string().optional().transform((v) => (v ? v : null)),
  messageId: z.string().optional().transform((v) => (v ? v : null)),
  reviewId: z.string().optional().transform((v) => (v ? v : null)),
});

export { uuid as uuidSchema };
