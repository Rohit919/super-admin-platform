/**
 * Platform (Super Admin) core — barrel.
 * Import from '@core/platform' anywhere in the codebase.
 */
export { PlatformService } from "./platform.service.js";
export {
  requirePlatform,
  requirePlatformPermission,
} from "./require-platform.js";
