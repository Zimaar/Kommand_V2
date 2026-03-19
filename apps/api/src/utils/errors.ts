import type { FastifyReply } from "fastify";

// Error codes used across the API
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  BAD_REQUEST: "BAD_REQUEST",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  PRIMITIVE_FAILED: "PRIMITIVE_FAILED",
  AGENT_ERROR: "AGENT_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  /** Operational errors are expected (bad input, not found). Non-operational = bugs. */
  public readonly isOperational: boolean;

  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, ErrorCode.NOT_FOUND);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, ErrorCode.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, ErrorCode.FORBIDDEN);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message, ErrorCode.BAD_REQUEST);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(422, message, ErrorCode.VALIDATION_ERROR);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests") {
    super(429, message, ErrorCode.RATE_LIMITED);
  }
}

export class PrimitiveFailedError extends AppError {
  constructor(primitive: string, message: string) {
    super(502, `Primitive ${primitive} failed: ${message}`, ErrorCode.PRIMITIVE_FAILED);
  }
}

export class AgentError extends AppError {
  constructor(message: string) {
    super(500, message, ErrorCode.AGENT_ERROR, false);
  }
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }

  console.error("Unhandled error:", error);
  return reply.status(500).send({
    success: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message: "An unexpected error occurred" },
  });
}
