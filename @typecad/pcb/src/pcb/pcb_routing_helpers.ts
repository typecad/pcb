import { Pin } from '../pin.js';
import { getCallSite } from '../utils/stack_trace.js';
import { RoutingError } from '../utils/errors.js';
import { formatSourceError } from '../utils/error_reporter.js';

/**
 * Convert a Pin object to a string identifier.
 * @param pin - The Pin object to convert
 * @returns String identifier (e.g., "U1.5" or "R1.pad1")
 */
export function pinToIdentifier(pin: Pin): string {
  return `${pin.reference}.${pin.number}`;
}

/**
 * Check if two pins represent the same pin (same component and pin number).
 * @param pin1 - First pin
 * @param pin2 - Second pin
 * @returns True if the pins match
 */
export function pinsMatch(pin1: Pin, pin2: Pin): boolean {
  return pin1.reference === pin2.reference && String(pin1.number) === String(pin2.number);
}

/**
 * Check if two connections match (order-independent).
 * @param conn1From - First connection from pin
 * @param conn1To - First connection to pin
 * @param conn2From - Second connection from pin
 * @param conn2To - Second connection to pin
 * @returns True if the connections represent the same connection
 */
export function connectionMatches(conn1From: Pin, conn1To: Pin, conn2From: Pin, conn2To: Pin): boolean {
  // Check both directions since connections are bidirectional
  return (
    (pinsMatch(conn1From, conn2From) && pinsMatch(conn1To, conn2To)) ||
    (pinsMatch(conn1From, conn2To) && pinsMatch(conn1To, conn2From))
  );
}

/**
 * Validate that a Pin object is valid and has required properties.
 * @param pin - The Pin object to validate
 * @param context - Context description for error messages
 * @returns True if valid
 * @throws Error if pin is invalid
 */
export function validatePin(pin: Pin, context: string): boolean {
  const site = getCallSite();

  if (!pin) {
    const err = new RoutingError(formatSourceError(`${context}: Pin is null or undefined`, site));
    err.stack = err.message;
    throw err;
  }

  if (typeof pin !== 'object') {
    const err = new RoutingError(formatSourceError(`${context}: Expected Pin object, got ${typeof pin}`, site));
    err.stack = err.message;
    throw err;
  }

  if (!pin.reference || typeof pin.reference !== 'string') {
    const err = new RoutingError(
      formatSourceError(`${context}: Pin has invalid or missing 'reference' property`, site),
    );
    err.stack = err.message;
    throw err;
  }

  if (pin.number === undefined || pin.number === null) {
    const err = new RoutingError(formatSourceError(`${context}: Pin has invalid or missing 'number' property`, site));
    err.stack = err.message;
    throw err;
  }

  return true;
}
