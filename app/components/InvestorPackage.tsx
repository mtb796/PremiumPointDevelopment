import React, { useMemo } from "react";
import type { Deal, Result } from "../../engine/types.js";
import { runDeal } from "../../engine/index.js";
import { flexDeal } from "../../engine/scenarios/scenarios.js";
import {
  buildTeaser,
  buildDiligenceChecklist,
  buildDataRoomIndex,
  dataRoomToCsv,
  DISCLOSURE_FOOTER,
  COMPLIANCE_NOTE,
} from "../../engine/export/package.js";
import { usd, usdShort, pct, mult, num } from "../format.js";

function Footer() {
  return <div className="slide-footer">{DISCLOSURE_FOOTER}</div>;
}

function downloadCsv(name: string, csv: string) {
  try {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore (e.g. sandboxed preview) */
  }
}

export function InvestorPackage({ deal, result }: { deal: Deal; result: Result }) {
  const downside = useMemo(
    () => runDeal(flexDeal(flexDeal(deal, "rent", 0.9), "hardCost", 1.1)),
    [deal],
  );
  const teaser = useMemo(() => buildTeaser(deal, result, downside), [deal, result, downside]);
  const checklist = useMemo(() => buildDiligenceChecklist(deal), [deal]);
  const dataRoom = useMemo(() => buildDataRoomIndex(), []);
  const r = result;

  return (
    <div className="package">
      <div className="package-actions no-print">
        <button onClick={() => window.print()}>Print / export to PDF</button>
        <button onClick={() => downloadCsv("data-room-index.csv", dataRoomToCsv(dataRoom))}>Download data room CSV</button>
      </div>

      {/* Teaser — one page */}
      <section className="slide teaser">
        <h1>
          {teaser.propertyName} {teaser.sample && <span className="badge sample">sample</span>}
        </h1>
        <p className="teaser-sub">One-page investment teaser · {teaser.returns.holdOrSell}</p>
        <div className="teaser-grid">
          <div>
            <h3>Program</h3>
            <div className="kv"><span className="k">Units</span><span className="v">{num(teaser.program.units)}</span></div>
            <div className="kv"><span className="k">Net rentable</span><span className="v">{num(teaser.program.netSf)} SF</span></div>
            <div className="kv"><span className="k">Gross area</span><span className="v">{num(teaser.program.grossSf)} SF</span></div>
          </div>
          <div>
            <h3>Headline returns (LP view)</h3>
            <div className="kv"><span className="k">Levered IRR</span><span className="v">{pct(teaser.returns.leveredIrr)}</span></div>
            {teaser.returns.lpIrr !== undefined && <div className="kv"><span className="k">LP IRR</span><span className="v">{pct(teaser.returns.lpIrr)}</span></div>}
            <div className="kv"><span className="k">Equity multiple</span><span className="v">{mult(teaser.returns.equityMultiple)}</span></div>
            <div className="kv"><span className="k">Development profit</span><span className="v">{usd(teaser.returns.profit)}</span></div>
          </div>
          <div>
            <h3>Downside (rev −10%, cost +10%)</h3>
            <div className="kv"><span className="k">Levered IRR</span><span className="v">{pct(downside.returns.levered.annual)}</span></div>
            <div className="kv"><span className="k">Profit</span><span className="v">{usd(downside.returns.profit)}</span></div>
          </div>
          <div>
            <h3>Capital stack</h3>
            {teaser.capitalStack.map((s) => (
              <div className="kv" key={s.label}><span className="k">{s.label}</span><span className="v">{usdShort(s.amount)} ({pct(s.pct, 0)})</span></div>
            ))}
          </div>
        </div>
        <Footer />
      </section>

      {/* Investment summary */}
      <section className="slide">
        <h2>Investment summary</h2>
        <div className="kv strong"><span className="k">Total cost incl. finance</span><span className="v">{usd(r.costSummary.totalCostInclFinance)}</span></div>
        <div className="kv"><span className="k">Gross {deal.businessPlan === "sell" ? "sales" : "sale value"}</span><span className="v">{usd(r.exit.grossValue)}</span></div>
        <div className="kv"><span className="k">Net proceeds</span><span className="v">{usd(r.exit.netProceeds)}</span></div>
        <div className="kv strong"><span className="k">Development profit</span><span className="v">{usd(r.returns.profit)}</span></div>
        <div className="kv"><span className="k">Unlevered / levered IRR</span><span className="v">{pct(r.returns.project.annual)} / {pct(r.returns.levered.annual)}</span></div>
        <div className="kv"><span className="k">Yield on cost / profit on cost</span><span className="v">{pct(r.returns.yieldOnCost)} / {pct(r.returns.profitOnCost)}</span></div>
        <Footer />
      </section>

      {/* Sources & uses */}
      <section className="slide">
        <h2>Development budget — sources &amp; uses</h2>
        <div className="su">
          <div>
            <h3>Uses</h3>
            {r.sourcesUses.uses.map((u) => <div className="kv" key={u.label}><span className="k">{u.label}</span><span className="v">{usd(u.amount)}</span></div>)}
            <div className="kv strong"><span className="k">Total uses</span><span className="v">{usd(r.sourcesUses.totalUses)}</span></div>
          </div>
          <div>
            <h3>Sources</h3>
            {r.sourcesUses.sources.map((s) => <div className="kv" key={s.label}><span className="k">{s.label}</span><span className="v">{usd(s.amount)}</span></div>)}
            <div className="kv strong"><span className="k">Total sources</span><span className="v">{usd(r.sourcesUses.totalSources)}</span></div>
          </div>
        </div>
        <Footer />
      </section>

      {/* Capital structure & returns */}
      <section className="slide">
        <h2>Capital structure &amp; returns</h2>
        <table className="tbl">
          <thead><tr><th>Tranche</th><th>Commitment</th><th>Rate</th><th>Exit balance</th></tr></thead>
          <tbody>
            {r.tranches.map((t) => (
              <tr key={t.label}><td>{t.label}</td><td>{usdShort(t.commitment)}</td><td>{pct(t.rate)}</td><td>{usdShort(t.exitBalance)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="kv"><span className="k">LP IRR / GP IRR</span><span className="v">{r.returns.lp ? pct(r.returns.lp.annual) : "—"} / {r.returns.gp ? pct(r.returns.gp.annual) : "—"}</span></div>
        <div className="kv"><span className="k">Equity multiple / peak equity</span><span className="v">{mult(r.returns.equityMultiple)} / {usdShort(r.returns.peakEquity)}</span></div>
        {r.returns.promote !== undefined && <div className="kv"><span className="k">GP promote</span><span className="v">{usd(r.returns.promote)}</span></div>}
        <Footer />
      </section>

      {/* Site, zoning, market — pending real data */}
      <section className="slide">
        <h2>Location, site &amp; zoning</h2>
        <p className="pending">Map, parcel dimensions, flood overlay, and the verified zoning rule table populate here once the site view and ordinance source reader are wired to real data. No zoning value is shown until it is read from the ordinance and verified.</p>
        <h2>Market &amp; comps</h2>
        <p className="pending">Submarket summary and comps populate from the market layer; every figure will carry its source and a verified-or-sample badge.</p>
        <Footer />
      </section>

      {/* Diligence checklist */}
      <section className="slide">
        <h2>Diligence checklist</h2>
        <ul className="checklist">
          {checklist.map((c) => <li key={c.item}><span className="box" /> {c.item}</li>)}
        </ul>
        <Footer />
      </section>

      {/* Data room */}
      <section className="slide">
        <h2>Data room index</h2>
        <table className="tbl">
          <thead><tr><th>Folder</th><th>Document</th><th>Status</th></tr></thead>
          <tbody>
            {dataRoom.map((d, i) => <tr key={i}><td>{d.folder}</td><td>{d.document}</td><td>{d.status}</td></tr>)}
          </tbody>
        </table>
        <Footer />
      </section>

      {/* Disclosures */}
      <section className="slide">
        <h2>Disclosures</h2>
        <p>{DISCLOSURE_FOOTER}</p>
        <p className="defn">{COMPLIANCE_NOTE}</p>
        <p className="defn">Not affiliated with Premium Point. All figures are sample data.</p>
        <Footer />
      </section>
    </div>
  );
}
