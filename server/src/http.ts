import type { FastifyReply } from 'fastify';
import { z, type ZodTypeAny } from 'zod';

/** Parse + validate a body/params object, sending a 400 on failure. Returns null when invalid. */
export function parse<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({ error: 'validation_error', details: result.error.flatten() });
    return null;
  }
  return result.data;
}

export { z };
