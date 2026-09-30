/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Logger } from '@nestjs/common';

import type { LoggerService } from '@nestjs/common';

/**
 * Special decorator for logger class.
 *
 * @param {LoggerService} baseLogger Logger service what will be decorated
 * @param {string} context Context, what will be written in logger
 * @return {*}  {LoggerService} Decorated LoggerService
 */
function addContextForOldLogger(
  baseLogger: Logger,
  context: string,
): LoggerService {
  return {
    error: (message, stack) => baseLogger.error(message, stack, context),
    log: (message) => baseLogger.log(message, context),
    warn: (message) => baseLogger.warn(message, context),
    debug: (message) => baseLogger.debug(message, context),
    verbose: (message) => baseLogger.verbose(message, context),
  };
}

/**
 * Add context message in the loggerService functions.
 *
 * @export
 * @param {LoggerService} baseLogger Logger service what will be decorated
 * @param {string} context Context, what will be written in logger
 * @return {*}  {LoggerService} Decorated LoggerService
 */
export function addContextDecoratorLogger(
  baseLogger: LoggerService,
  context: string,
): LoggerService {
  // Special decorator for old loggers
  if (baseLogger instanceof Logger) {
    const winstoneDecoratedLogger = addContextForOldLogger(baseLogger, context);
    return winstoneDecoratedLogger;
  }

  // Decorator for any other cases
  return {
    error: (message, ...params) => {
      baseLogger.error(`[${context}] ${message}`, ...params);
    },
    log: (message, ...params) => {
      baseLogger.log(`[${context}] ${message}`, ...params);
    },
    warn: (message, ...params) => {
      baseLogger.warn(`[${context}] ${message}`, ...params);
    },
  };
}
