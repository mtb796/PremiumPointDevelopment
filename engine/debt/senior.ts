/**
 * Senior construction loan sizing (engine convention 5).
 *
 * Senior = the lower of the loan-to-cost and debt-yield limits. The per-month draw,
 * capitalized-interest, and repayment mechanics live in the orchestrator (index.ts),
 * because they are coupled to the funding order (convention 4) and the circularity
 * solver (convention 7). This module only sizes the commitment given a candidate total
 * cost and the stabilized NOI.
 */
import type { Tranche, Money, Rate } from "../types.js";

export interface SeniorSizing {
  commitment: Money;
  boundBy: "loan-to-cost" | "debt-yield";
  originationFee: Money;
  exitFee: Money;
}

export function sizeSenior(tranche: Tranche, totalCost: Money, stabilizedNoi: Money): SeniorSizing {
  const ltcLimit = tranche.maxPctOfCost * totalCost;

  let commitment = ltcLimit;
  let boundBy: "loan-to-cost" | "debt-yield" = "loan-to-cost";

  const minDebtYield: Rate | undefined = tranche.minDebtYield;
  if (minDebtYield !== undefined && minDebtYield > 0) {
    // Debt yield = stabilized NOI / loan >= minDebtYield  =>  loan <= NOI / minDebtYield
    const dyLimit = stabilizedNoi / minDebtYield;
    if (dyLimit < commitment) {
      commitment = dyLimit;
      boundBy = "debt-yield";
    }
  }

  return {
    commitment,
    boundBy,
    originationFee: tranche.originationFeePct * commitment,
    exitFee: tranche.exitFeePct * commitment,
  };
}
