import type { AiConfig } from './types.js'

/** Identical policy defaults to the reviewed M3.1 controls. */
export const referencePolicies = Object.freeze({
  A0: Object.freeze({ policy: 'random', deployment: 'random' } as const),
  A1: Object.freeze({ policy: 'legacy', deployment: 'random' } as const),
  A2: Object.freeze({ policy: 'tactical', deployment: 'random' } as const),
  S1: Object.freeze({ policy: 'search', deployment: 'random', transition: 'canonical', orderingStyle: 'legacy',
    tacticalExtensions: 0, depth: 2 } as const),
} satisfies Record<string, AiConfig>)
