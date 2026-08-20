import { balanceChipClass } from "./presets.ts";

function assertEqual(actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

assertEqual(balanceChipClass(null, false, "-1.00"), "chip-danger");
assertEqual(balanceChipClass(null, false, "0.00"), "chip-success");
assertEqual(balanceChipClass(null, false, "110.00"), "chip-success");
