import type { FastifyReply } from 'fastify';
import type { ErrorResponse, ErrorDetail } from '../schemas/common.js';

// Error codes (used as error.code in responses)
export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Send 404 Not Found response
 */
export function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({
    error: {
      code: ErrorCodes.NOT_FOUND,
      message,
    },
  } satisfies ErrorResponse);
}

/**
 * Send 400 Validation Error response with field-level details
 */
export function validationError(
  reply: FastifyReply,
  message: string,
  details?: ErrorDetail[]
): FastifyReply {
  return reply.code(400).send({
    error: {
      code: ErrorCodes.INVALID_INPUT,
      message,
      details,
    },
  } satisfies ErrorResponse);
}

/**
 * Send 403 Forbidden response
 */
export function forbidden(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(403).send({
    error: {
      code: ErrorCodes.FORBIDDEN,
      message,
    },
  } satisfies ErrorResponse);
}

/**
 * Send 409 Conflict response (e.g., duplicate record)
 */
export function conflict(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(409).send({
    error: {
      code: ErrorCodes.CONFLICT,
      message,
    },
  } satisfies ErrorResponse);
}

/**
 * Send 500 Internal Server Error response
 */
export function serverError(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(500).send({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message,
    },
  } satisfies ErrorResponse);
}
