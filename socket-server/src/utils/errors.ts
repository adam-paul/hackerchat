// socket-server/src/utils/errors.ts

import type { SocketType, HandlerResult } from '../types/handlers';
import { EVENTS } from '../config/socket';
import { z } from 'zod';

export class SocketError extends Error {
  constructor(
    message: string,
    public code: string = 'SOCKET_ERROR',
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'SocketError';
  }
}

export const handleSocketError = <T>(socket: SocketType, error: unknown, channelId?: string): HandlerResult<T> => {
  let errorMessage = 'An unexpected error occurred';
  let errorCode = 'INTERNAL_ERROR';

  if (error instanceof SocketError) {
    errorMessage = error.message;
    errorCode = error.code;
  } else if (error instanceof z.ZodError) {
    errorMessage = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    errorCode = 'VALIDATION_ERROR';
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Emit error event to the client
  socket.emit(EVENTS.ERROR, {
    error: errorMessage,
    code: errorCode,
    channelId
  });

  // Log the error
  console.error(`Socket Error [${errorCode}]:`, errorMessage);

  return {
    success: false,
    error: errorMessage
  };
};

export const validateEvent = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new SocketError(
        `Validation failed: ${error.errors.map(err => err.message).join(', ')}`,
        'VALIDATION_ERROR'
      );
    }
    throw error;
  }
}; 