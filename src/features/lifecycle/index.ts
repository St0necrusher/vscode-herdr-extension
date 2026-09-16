/**
 * Lifecycle feature public entry point. The feature performs side-effect-free
 * discovery on activation and settings changes; startup is explicit, guarded by
 * a previously observed stopped state, and followed by fresh discovery.
 */
export type {
  HerdrAvailability,
  HerdrAvailabilityView,
  HerdrDiscoveryResult,
  HerdrLifecyclePort,
  HerdrSettings,
  HerdrSettingsPort,
  LifecycleDependencies,
  LifecycleFeature,
  LifecycleLogger,
} from "./internal/contracts.js";
export { createLifecycleFeature } from "./internal/lifecycle.js";
