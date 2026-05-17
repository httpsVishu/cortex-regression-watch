# Cortex-Regression-Watch

A rollout regression detector for robotics fleet policy updates.

Built specifically around the operational gap in Sereact's Cortex deployment loop: after a policy push, robots across sites pull updated weights asynchronously. There is no native visibility into which robots regressed, how badly, or what the operational impact is in real time.

This tool answers four questions the moment a rollout lands:

- Which robots got worse?
- How much worse and why?
- What is the blast radius right now in failed picks per hour?
- Should we halt or roll back?

---

## What it does

**Per-robot continuous risk scoring (0–100)** built from three weighted components:

| Component | Weight | Signal |
|---|---|---|
| Pick success rate drop | 0–50 pts | Primary regression signal |
| Failure count multiplier | 0–30 pts | Operational severity |
| Intervention rate degradation | 0–20 pts | Human cost signal |

This is not a pass/fail threshold check. A robot that drops 8pp success rate with a 3× failure spike scores differently from one that drops 8pp with stable failures because they represent different operational situations.

**Fleet-level blast radius**: estimated failed picks per hour across all FAILED robots, computed from each robot's success drop × baseline pick rate. Drives the `ROLLBACK ADVISED / MONITOR CLOSELY / STABLE` recommendation in the header.

**Rollback simulation**: confirming a rollback triggers a live fleet recovery animation. Robots flip from FAILED → HEALTHY one by one as they pull the previous policy version, with a live counter in the callout. Header transitions to `✓ ROLLBACK COMPLETE` when the fleet stabilizes.

**Failure mode clustering**: groups robots by failure type (grip slip, object misread, place failure, recovery timeout) with average risk score per cluster. Tells you whether a regression is systemic (one failure mode, many robots) or scattered.

**Site-level risk aggregates**: per-site average risk score, updated/total robot count, sorted by severity. Tells you which customer sites are most affected before you make a call.

**Robot detail drawer**: click any robot to see full performance delta, risk score breakdown by component, intervention rate before/after, failure onset hour, and a structured finding.

**Python charts (optional)**: two Matplotlib outputs served from the backend:
- Stacked risk bar chart per robot, broken down by component with CRITICAL/REGRESSED/DEGRADED threshold lines
- Failure mode × site heatmap showing robots affected and max success drop per cell

---

## The gap this addresses

Sereact's Cortex policies are trained on a continuous data flywheel and deployed fleet-wide. Each robot pulls updated weights asynchronously meaning after any push, the fleet is in a mixed-version state for minutes to hours depending on network conditions and maintenance windows.

Aggregate metrics (fleet-level pick success rate, daily intervention count) are too slow and too coarse to catch a bad rollout fast. By the time the KPI moves, thousands of picks have already failed.

This tool operates at the robot level, immediately after a rollout, giving the team a decision surface — not just a metric.

---

## Stack

```
frontend/     HTML + CSS + vanilla JS (no framework, no build step)
backend/      Node.js + Express
python/       Matplotlib charts (optional: dashboard works without them)
data/         JSON flat file (20 robots across 8 real customer sites)
```

No database. No authentication. Opens with one double-click for demo purposes.

---

## Setup

**Backend**
```bash
cd backend
npm install
npm run dev
# → http://localhost:5000
```

**Frontend**

Open `frontend/index.html` directly in browser, or use VS Code Live Server.

**Python charts** (optional)
```bash
pip install numpy matplotlib
cd backend
npm run charts
# or run directly:
# python python/risk_chart.py
# python python/failure_heatmap.py
```

Then click **Generate Charts** in the dashboard to load them.

---

## Data

`backend/data/sample-robots.json` — 20 robots across 8 sites modeled on Sereact's actual deployment footprint:

- bol. — Amsterdam
- Active Ants — Rotterdam
- BMW — Munich
- Daimler Truck — Stuttgart
- Rohlik — Prague
- MS Direct — Zurich
- PepsiCo — Warsaw
- Austrian Post — Vienna

Each robot carries: pick success rates before/after, failure counts, intervention rates, failure mode, failure onset hour post-update, gripper type, robot type, and operator notes. The data is designed to produce a realistic distribution — some robots clean, some degraded, some critically failed, some not yet updated.

---

## Project structure

```
cortex-regression-watch/
│
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── data/
│   │   └── sample-robots.json
│   ├── services/
│   │   └── analyzeRollout.js
│   ├── python/
│   │   ├── risk_chart.py
│   │   └── failure_heatmap.py
│   └── outputs/
│       ├── risk_chart.png
│       └── failure_heatmap.png
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── README.md
```

---

## What this is not

This is a prototype, not production tooling. It uses flat JSON instead of a real telemetry store, mock pick rates instead of live robot streams and a simulated rollback instead of an actual fleet API call. The point is to demonstrate the inspection surface and decision loop, not to ship as-is.

The production version of this connects to whatever telemetry pipeline the fleet uses, pulls real post-rollout metrics per robot and integrates with the deployment system to trigger actual rollbacks.