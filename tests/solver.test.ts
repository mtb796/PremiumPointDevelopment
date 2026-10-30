/**
 * Circularity solver (engine convention 7): the interest-reserve / total-cost iteration
 * converges on real deals, and a forced non-convergence raises a visible error rather
 * than returning a silent wrong number.
 */
import { describe, it, expect } from "vitest";
import { runDeal } from "../engine/index.js";
import { NonConvergenceError } from "../engine/solve.js";
import { structuredDeal } from "../data/golden-deals/structured.js";
import { apraoDeal } from "../data/golden-deals/aprao.js";
import type { Deal } from "../engine/types.js";

describe("circularity solver", () => {
  it("converges on the reference deals", () => {
    expect(() => runDeal(apraoDeal)).not.toThrow();
    expect(() => runDeal(structuredDeal)).not.toThrow();
  });

  it("raises a visible error when the finance cost cannot converge", () => {
    // Fees so large (relative to loan size) that each pass inflates total cost faster
    // than it settles — the fixed point diverges.
    const d: Deal = structuredClone(structuredDeal);
    const senior = d.stack.tranches.find((t) => t.kind === "senior")!;
    senior.maxPctOfCost = 0.95;
    senior.originationFeePct = 1.5;
    senior.exitFeePct = 1.5;
    expect(() => runDeal(d)).toThrow(NonConvergenceError);
  });
});
