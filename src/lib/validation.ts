import { z } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Validation helpers shared by every Server Action.
 * One Zod schema = single source of truth for client forms AND server validation.
 */

/** Parse or throw a ValidationError with per-field messages (for useActionState forms). */
export function zParse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Invalid input.", result.error.flatten().fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

/** Parse FormData directly (Server Actions receive FormData from forms). */
export function zParseFormData<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  return zParse(schema, Object.fromEntries(formData.entries()));
}

// ----------------------------------------------------
// Reusable field primitives (DRY across all schemas)
// ----------------------------------------------------

export const zUuid = z.string().uuid("Invalid identifier.");

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.");

export const zPassword = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

/** Money: accepts "12.50" from inputs, validates 2 decimals max, non-negative. */
export const zMoney = z.coerce
  .number()
  .nonnegative("Amount cannot be negative.")
  .multipleOf(0.01, "Maximum 2 decimal places.");

export const zPositiveInt = z.coerce.number().int().positive();
export const zNonNegativeInt = z.coerce.number().int().nonnegative();

export const zRequiredString = (field: string, max = 255) =>
  z.string().trim().min(1, `${field} is required.`).max(max, `${field} is too long.`);

export const zOptionalString = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

/** Pagination — used by every list endpoint. */
export const zPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Boolean query-param coercion. Plain `z.coerce.boolean()` is a footgun
 * for query strings: `Boolean("false")` is `true`, so a client that
 * explicitly sends `?flag=false` (rather than omitting the param) gets
 * `true` back. This only treats the literal string "true" (or a real
 * boolean true) as true — everything else, including "false", is false.
 */
export const zBoolParam = z.preprocess(
  (v) => (typeof v === "string" ? v === "true" : v),
  z.boolean().default(false)
);

// ----------------------------------------------------
// Auth schemas (used in Step 3 actions)
// ----------------------------------------------------

export const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z
  .object({
    fullName: zRequiredString("Full name", 100),
    email: zEmail,
    password: zPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: zEmail });

export const resetPasswordSchema = z
  .object({
    password: zPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
