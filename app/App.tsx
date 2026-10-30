import React, { useMemo, useState } from "react";
import type { Deal, Result } from "../engine/types.js";
import { runDeal } from "../engine/index.js";
import { defaultDeal, presets } from "./state.js";
import { Inputs } from "./components/Inputs.js";
import { Results } from "./components/Results.js";
import { Analysis } from "./components/Analysis.js";
import { Tracker } from "./components/Tracker.js";
import { Verdict } from "./components/Verdict.js";
import { InvestorPackage } from "./components/InvestorPackage.js";

type Tab = "report" | "verdict" | "analysis" | "tracker" | "package";

const DISCLOSURE =
  "Illustrative only. Sample assumptions. Not an offer to sell or a solicitation of an offer to buy any security. Not affiliated with Premium Point.";

export function App() {
  const [deal, setDeal] = useState<Deal>(defaultDeal());
  const [tab, setTab] = useState<Tab>("report");

  // Live recalc: the engine is pure, so render straight from a memoized run.
  const { result, error } = useMemo((): { result: Result | null; error: string | null } => {
    try {
      return { result: runDeal(deal), error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [deal]);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Premium Point Development</h1>
          <p className="sub">Address → program → capital stack → returns. Development underwriting (sample).</p>
        </div>
        <div className="top-actions">
          <div className="plan-toggle">
            <button
              className={deal.businessPlan !== "sell" ? "on" : ""}
              onClick={() => setDeal({ ...deal, businessPlan: "hold" })}
            >
              Hold &amp; rent
            </button>
            <button
              className={deal.businessPlan === "sell" ? "on" : ""}
              onClick={() => setDeal({ ...deal, businessPlan: "sell" })}
            >
              Build to sell
            </button>
          </div>
          <select
            onChange={(e) => {
              const p = presets[Number(e.target.value)];
              if (p) setDeal(p.make());
            }}
            defaultValue="0"
          >
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="layout">
        <aside className="col-inputs">
          <Inputs deal={deal} setDeal={setDeal} />
        </aside>

        <main className="col-output">
          <nav className="tabs">
            <button className={tab === "report" ? "on" : ""} onClick={() => setTab("report")}>
              Pro forma
            </button>
            <button className={tab === "verdict" ? "on" : ""} onClick={() => setTab("verdict")}>
              Hold vs sell
            </button>
            <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>
              Sensitivity
            </button>
            <button className={tab === "tracker" ? "on" : ""} onClick={() => setTab("tracker")}>
              Tracker
            </button>
            <button className={tab === "package" ? "on" : ""} onClick={() => setTab("package")}>
              Investor package
            </button>
          </nav>

          {error && (
            <div className="flag error">
              <strong>cannot calculate</strong> {error}
            </div>
          )}
          {result && tab === "report" && <Results result={result} />}
          {tab === "verdict" && <Verdict deal={deal} />}
          {result && tab === "analysis" && <Analysis deal={deal} />}
          {tab === "tracker" && <Tracker deal={deal} />}
          {result && tab === "package" && <InvestorPackage deal={deal} result={result} />}
        </main>
      </div>

      <footer className="disclosure">{DISCLOSURE}</footer>
    </div>
  );
}
