import { assertUnitInterval } from "@/shared/domain/validation";

export function validateNotifyThreshold(threshold: number): void {
  assertUnitInterval(threshold, "NOTIFY_THRESHOLD");
}
