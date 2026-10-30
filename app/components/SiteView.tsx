import React, { useMemo, useState } from "react";
import type { BuildableProgram, District, Parcel, RuleTable, SourcedNumber } from "../../engine/buildable/types.js";
import { maxBuildableBothCases, type MaxBuildableResult } from "../../engine/buildable/buildable.js";
import { reviewRuleTable } from "../../engine/rules/reader.js";
import arlington from "../../rules/arlington-va.json";
import fairfax from "../../rules/fairfax-va.json";
import { Card, NumberField, Row, SampleBadge } from "./ui.js";
import { num, pct } from "../format.js";
import { geocode, flood, type GeocodeResult, type FloodResult } from "../api.js";

// An illustrative district so the engine's output is demonstrable. NOT zoning data — its
// values carry an explicit "illustrative example" citation, never an ordinance quote.
const exampleCite = (quote: string) => ({ ordinance: "ILLUSTRATIVE EXAMPLE — not from any ordinance", effectiveDate: "—", section: "—", page: "—", quote });
const ex = (value: number): SourcedNumber => ({ status: "person-entered", value, citation: exampleCite("illustrative example value") });
const exampleDistrict: District = {
  name: "Example RA-type (illustrative)",
  permittedUses: ["multifamily"],
  byRight: {
    maxStories: ex(4),
    maxHeightFt: ex(40),
    maxDensityDuAc: ex(36),
    maxLotCoverage: ex(0.56),
    setbacksFt: { front: ex(20), side: ex(10), rear: ex(15) },
    parking: { perUnit: ex(1.6), stallSf: ex(325) },
  },
  planBased: { maxStories: ex(10), maxDensityDuAc: ex(72), maxHeightFt: ex(95), maxLotCoverage: ex(0.56), setbacksFt: { front: ex(20), side: ex(10), rear: ex(15) }, parking: { perUnit: ex(1.0), stallSf: ex(325) } },
};

interface Option { key: string; label: string; district: District; verified: boolean; illustrative: boolean }

function buildOptions(): Option[] {
  const opts: Option[] = [{ key: "example", label: "Example RA-type (illustrative — not zoning data)", district: exampleDistrict, verified: false, illustrative: true }];
  for (const table of [arlington as unknown as RuleTable, fairfax as unknown as RuleTable]) {
    for (const [name, d] of Object.entries(table.districts)) {
      opts.push({ key: `${table.jurisdiction}:${name}`, label: `${table.jurisdiction} — ${name} (unverified)`, district: d, verified: table.verified, illustrative: false });
    }
  }
  return opts;
}

function CaseColumn({ title, r }: { title: string; r: MaxBuildableResult }) {
  return (
    <div className="case-col">
      <h3>{title}</h3>
      {r.blocked ? (
        <div className="flag warning">
          <strong>cannot calculate</strong> {r.sentence}
        </div>
      ) : (
        <>
          <div className="big">{num(r.units ?? 0)} <span>units</span></div>
          <p className="defn">{r.sentence}</p>
          <Row k="Binding constraint" v={r.bindingConstraint ?? "—"} />
          <Row k="Gross / net SF" v={`${num(Math.round(r.grossSf ?? 0))} / ${num(Math.round(r.netSf ?? 0))}`} />
          <Row k="Footprint" v={`${num(Math.round(r.footprintSf ?? 0))} SF`} />
          {r.parkingStalls !== undefined && <Row k="Parking stalls" v={num(r.parkingStalls)} />}
          <Row k="Stories" v={String(r.stories ?? "—")} />
        </>
      )}
    </div>
  );
}

export function SiteView() {
  const options = useMemo(buildOptions, []);
  const [address, setAddress] = useState("2100 Clarendon Blvd, Arlington, VA");
  const [geo, setGeo] = useState<GeocodeResult | { available: false } | null>(null);
  const [fld, setFld] = useState<FloodResult | { available: false } | null>(null);
  const [busy, setBusy] = useState(false);

  const [optKey, setOptKey] = useState("example");
  const opt = options.find((o) => o.key === optKey)!;
  const [parcel, setParcel] = useState<Parcel>({ areaSf: 87_120, widthFt: 200, depthFt: 435.6, excludedAreaSf: 0 });
  const [program, setProgram] = useState<BuildableProgram>({ efficiency: 0.85, avgUnitNetSf: 850, floorToFloorFt: 10 });
  const [parkingType, setParkingType] = useState<"surface" | "structured">("surface");

  const result = useMemo(
    () => maxBuildableBothCases(parcel, opt.district, program, { parkingType }),
    [parcel, opt, program, parkingType],
  );
  const review = useMemo(() => {
    if (opt.illustrative) return null;
    return reviewRuleTable(((o: Option) => ({ jurisdiction: "", verified: o.verified, districts: { [o.district.name]: o.district } }))(opt) as RuleTable);
  }, [opt]);

  const runGeocode = async () => {
    setBusy(true);
    setFld(null);
    const g = await geocode(address);
    setGeo(g);
    if ("available" in g && g.available && g.found && g.lat !== undefined && g.lon !== undefined) {
      setFld(await flood(g.lat, g.lon));
    }
    setBusy(false);
  };

  const setP = (k: keyof Parcel, v: number) => setParcel({ ...parcel, [k]: v });
  const setPr = (k: keyof BuildableProgram, v: number) => setProgram({ ...program, [k]: v });

  return (
    <>
      <Card title="Address" right={<span className="muted">geocoder + flood via server proxy</span>}>
        <div className="addr">
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Type an address" />
          <button onClick={runGeocode} disabled={busy}>{busy ? "…" : "Locate"}</button>
        </div>
        {geo && ("available" in geo && geo.available && geo.found ? (
          <>
            <Row k="Matched" v={geo.matchedAddress ?? "—"} />
            <Row k="Coordinates" v={`${geo.lat?.toFixed(5)}, ${geo.lon?.toFixed(5)}`} />
            <Row k="FEMA flood zone" v={fld && "available" in fld && fld.available ? String(fld.zone ?? "none mapped") : "not available"} />
          </>
        ) : (
          <div className="flag warning"><strong>not available</strong> Geocoder/flood proxy not reachable here (needs the serverless functions deployed and endpoints confirmed). Enter the parcel manually below to run the max-buildable engine.</div>
        ))}
      </Card>

      <Card title="Parcel (manual entry)">
        <div className="grid">
          <NumberField label="Lot area" value={parcel.areaSf} onChange={(v) => setP("areaSf", v)} suffix="SF" sample />
          <NumberField label="Width" value={parcel.widthFt ?? 0} onChange={(v) => setP("widthFt", v)} suffix="ft" sample />
          <NumberField label="Depth" value={parcel.depthFt ?? 0} onChange={(v) => setP("depthFt", v)} suffix="ft" sample />
          <NumberField label="Excluded area (flood/slope)" value={parcel.excludedAreaSf ?? 0} onChange={(v) => setP("excludedAreaSf", v)} suffix="SF" sample />
          <NumberField label="Efficiency (net/gross)" value={program.efficiency} onChange={(v) => setPr("efficiency", v)} scale={100} suffix="%" digits={0} sample />
          <NumberField label="Avg unit (net)" value={program.avgUnitNetSf} onChange={(v) => setPr("avgUnitNetSf", v)} suffix="SF" sample />
        </div>
      </Card>

      <Card
        title="Zoning district"
        right={
          <select value={optKey} onChange={(e) => setOptKey(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        }
      >
        <div className="plan-toggle" style={{ marginBottom: 10 }}>
          <button className={parkingType === "surface" ? "on" : ""} onClick={() => setParkingType("surface")}>Surface parking</button>
          <button className={parkingType === "structured" ? "on" : ""} onClick={() => setParkingType("structured")}>Structured parking</button>
        </div>
        {opt.illustrative ? (
          <div className="flag info"><strong>illustrative</strong> These standards are an example to exercise the engine — not zoning data for any real district.</div>
        ) : (
          <div className="flag warning">
            <strong>unreviewed rules</strong> This district is unverified; every standard still needs reading from the ordinance PDF. Results below are blocked until a person reads and verifies each value. {review && `(${review.needsReview.length} values need reading.)`}
          </div>
        )}
      </Card>

      <Card title="Max-buildable — by-right vs. plan-based" right={<SampleBadge title="parcel & program are sample inputs" />}>
        <div className="cases">
          <CaseColumn title="By-right" r={result.byRight} />
          <CaseColumn title="Plan-based (discretionary approval)" r={result.planBased} />
        </div>
        <p className="defn">
          The engine reports what the written rules allow; it does not predict approvals, variances, or timelines. The
          plan-based case depends on a discretionary approval. A value that cannot be read blocks the result — no default
          is substituted.
        </p>
      </Card>
    </>
  );
}
