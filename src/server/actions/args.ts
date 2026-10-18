import "server-only";
import { z } from "zod";
import { AppError } from "../errors";

/**
 * Runtime checks for server-action arguments. TypeScript types vanish at runtime and actions are
 * reachable by direct POST, so scalar arguments are validated here (structured payloads are
 * validated by the services' zod schemas).
 */
export const A = {
  id: z.string().max(64),
  bool: z.boolean(),
  email: z.string().max(320),
  text: (max: number) => z.string().max(max),
  ids: z.array(z.string().max(64)).max(500),
  role: z.enum(["STUDENT", "FACULTY", "ADMIN"]),
  facultyRole: z.enum(["OWNER", "INSTRUCTOR"]),
};

export function arg<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("VALIDATION", "The request was malformed. Refresh the page and try again.");
  return parsed.data;
}
