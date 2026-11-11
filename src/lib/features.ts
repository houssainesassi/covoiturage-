import "server-only";

/**
 * Car rental is built but OFF by default: renting cars without a Transport
 * Ministry licence is unlawful in Tunisia (see docs/LEGAL.md). Turn it on only
 * after legal review AND after migration 20261111000016 is applied.
 */
export const rentalsEnabled = () => process.env.RENTALS_ENABLED === "true";
