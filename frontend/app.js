const API = window.location.hostname === "localhost"
  ? "http://localhost:5000"
  : "https://cortex-regression-watch.onrender.com";

let allRobots = [];
let activeFilter = "ALL";
let sortDescending = true;

function riskColor(score, updated) {
  if (!updated) return "var(--text2)";
  if (score >= 75) return "var(--red)";
  if (score >= 40) return "var(--orange)";
  if (score >= 15) return "var(--yellow)";
  return "var(--green)";
}

function statusBadgeClass(status) {
  return {
    HEALTHY_UPDATE: "badge-healthy",
    DEGRADED:       "badge-degraded",
    REGRESSED:      "badge-regressed",
    FAILED_UPDATE:  "badge-failed",
    NOT_UPDATED:    "badge-notupdated",
  }[status] || "badge-notupdated";
}

function statusLabel(status) {
  return {
    HEALTHY_UPDATE: "Healthy",
    DEGRADED:       "Degraded",
    REGRESSED:      "Regressed",
    FAILED_UPDATE:  "Failed",
    NOT_UPDATED:    "Not Updated",
  }[status] || status;
}

function fmt(val, suffix = "") {
  if (val === null || val === undefined) return "—";
  return val + suffix;
}

function renderStats(data) {
  const { total, healthy, degraded, regressed, failed, not_updated, blast_radius } = data;

  document.getElementById("statTotal").textContent       = total;
  document.getElementById("statHealthy").textContent     = healthy;
  document.getElementById("statHealthyPct").textContent  = `${Math.round(healthy/total*100)}% of fleet`;
  document.getElementById("statDegraded").textContent    = degraded  || 0;
  document.getElementById("statRegressed").textContent   = regressed || 0;
  document.getElementById("statFailed").textContent      = failed;
  document.getElementById("statNotUpdated").textContent  = not_updated;
  document.getElementById("statPicksLost").textContent   =
    blast_radius.estimated_failed_picks_per_hr.toLocaleString();

  const badge = document.getElementById("rolloutStatusBadge");
  const rec   = blast_radius.rollback_recommendation;
  const styles = {
    ROLLBACK_ADVISED: { text: "⚡ ROLLBACK ADVISED",  bg: "rgba(232,54,79,0.1)",  border: "var(--red)",    color: "var(--red)"    },
    MONITOR_CLOSELY:  { text: "⚠ MONITOR CLOSELY",   bg: "rgba(245,106,0,0.1)", border: "var(--orange)", color: "var(--orange)" },
    STABLE:           { text: "✓ STABLE",             bg: "rgba(0,217,122,0.1)", border: "var(--green)",  color: "var(--green)"  },
  };
  const s = styles[rec] || styles.STABLE;
  badge.textContent = s.text;
  badge.style.background   = s.bg;
  badge.style.borderColor  = s.border;
  badge.style.color        = s.color;

  if (rec === "ROLLBACK_ADVISED" || rec === "MONITOR_CLOSELY") {
    const callout = document.getElementById("blastCallout");
    callout.style.display = "flex";
    document.getElementById("blastTitle").textContent =
      rec === "ROLLBACK_ADVISED" ? "Rollback Recommended" : "Monitoring Required";
    document.getElementById("blastText").textContent =
      `${failed} robots in FAILED state across ${blast_radius.affected_sites} site${blast_radius.affected_sites > 1 ? "s" : ""}. ` +
      `Estimated ${blast_radius.estimated_failed_picks_per_hr.toLocaleString()} failed picks/hr across affected cells. ` +
      `${not_updated} robots still on v2.7 pending update.`;
    const action = document.getElementById("blastAction");
    action.textContent = rec === "ROLLBACK_ADVISED" ? "ROLLBACK v2.7" : "HOLD ROLLOUT";
    action.style.cssText = `
      background: ${rec === "ROLLBACK_ADVISED" ? "rgba(232,54,79,0.15)" : "rgba(245,106,0,0.12)"};
      border: 1px solid ${rec === "ROLLBACK_ADVISED" ? "var(--red)" : "var(--orange)"};
      color: ${rec === "ROLLBACK_ADVISED" ? "var(--red)" : "var(--orange)"};
      cursor: pointer; border-radius: 3px;
    `;
  }
}

function renderTable(robots) {
  const tbody = document.getElementById("robotTableBody");
  const visible = (activeFilter === "ALL"
    ? [...robots]
    : robots.filter(r => r.status === activeFilter))
    .sort((a, b) => sortDescending
      ? b.risk_score - a.risk_score
      : a.risk_score - b.risk_score);

  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px;">No robots match this filter</td></tr>`;
    return;
  }

  tbody.innerHTML = visible.map(r => {
    const col     = riskColor(r.risk_score, r.updated);
    const drop    = r.success_drop;
    const dropStr = drop === null ? "<span class='delta-nil'>—</span>"
                  : drop > 0 ? `<span class='delta-pos'>▲ ${drop.toFixed(1)}pp</span>`
                  : `<span class='delta-neg'>▼ ${Math.abs(drop).toFixed(1)}pp</span>`;

    const failStr = r.failure_increase === null ? "—"
                  : r.failure_increase > 0 ? `+${r.failure_increase}`
                  : `${r.failure_increase}`;

    const failColor = r.failure_increase > 0 ? "color:var(--red)"
                    : r.failure_increase < 0 ? "color:var(--green)"
                    : "color:var(--text3)";

    const modeStr  = r.main_failure_reason && r.main_failure_reason !== "none" && r.main_failure_reason !== "not_updated"
                   ? `<span class="mode-tag">${r.main_failure_reason.replace(/_/g, " ")}</span>`
                   : `<span style="color:var(--text3)">—</span>`;

    return `<tr onclick="openDrawer('${r.robot_id}')">
      <td><strong>${r.robot_id}</strong></td>
      <td style="color:var(--text2)">${r.site_label.split("—")[0].trim()}</td>
      <td style="color:var(--text3)">${r.robot_type.replace(/-/g," ")}</td>
      <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
      <td>
        <div class="risk-cell">
          <div class="risk-bar-wrap">
            <div class="risk-bar-fill" style="width:${r.risk_score}%;background:${col}"></div>
          </div>
          <span class="risk-num" style="color:${col}">${r.risk_score}</span>
        </div>
      </td>
      <td>${dropStr}</td>
      <td style="${failColor}">${failStr}</td>
      <td>${modeStr}</td>
    </tr>`;
  }).join("");
}

function renderFailureClusters(summary) {
  const container = document.getElementById("failureClusterList");

  const entries = Object.entries(summary)
    .sort((a, b) => b[1].count - a[1].count);

  if (!entries.length) {
    container.innerHTML = `<div style="padding:12px;color:var(--text3);font-size:11px;">No failure clusters detected.</div>`;
    return;
  }

  const COLORS = {
    grip_slip:        "var(--red)",
    object_misread:   "var(--orange)",
    place_failure:    "var(--yellow)",
    recovery_timeout: "var(--orange)",
  };

  container.innerHTML = entries.map(([mode, info]) => {
    const col = COLORS[mode] || "var(--red)";
    return `<div class="cluster-item" style="border-left-color:${col}">
      <div class="cluster-top">
        <div class="cluster-mode">${mode.replace(/_/g," ")}</div>
        <div class="cluster-count" style="color:${col}">${info.count} robot${info.count > 1 ? "s" : ""}</div>
      </div>
      <div class="cluster-robots">${info.robots.join(", ")}</div>
      <div class="cluster-risk">
        <span class="risk-label">Avg risk score: </span>
        <span style="color:${col};font-weight:700">${info.avg_risk}</span>
      </div>
    </div>`;
  }).join("");
}

function renderSites(sites) {
  const container = document.getElementById("siteList");

  container.innerHTML = sites.map(s => {
    const col = s.avg_risk_score >= 60 ? "var(--red)"
              : s.avg_risk_score >= 35 ? "var(--orange)"
              : s.avg_risk_score >= 15 ? "var(--yellow)"
              : "var(--green)";
    return `<div class="site-row">
      <div class="site-name">${s.site_label}</div>
      <div class="site-robots-count">${s.updated}/${s.total}</div>
      <div class="site-bar-wrap">
        <div class="site-bar-fill" style="width:${s.avg_risk_score}%;background:${col}"></div>
      </div>
      <div class="site-risk-score" style="color:${col}">${s.avg_risk_score}</div>
    </div>`;
  }).join("");
}

function openDrawer(robotId) {
  const r = allRobots.find(x => x.robot_id === robotId);
  if (!r) return;

  document.getElementById("drawerRobotId").textContent = r.robot_id;
  document.getElementById("drawerRobotMeta").textContent =
    `${r.site_label}  ·  ${r.robot_type.replace(/-/g," ")}  ·  gripper: ${r.gripper}`;

  const col = riskColor(r.risk_score, r.updated);

  const breakdownHtml = r.risk_breakdown ? `
    <div class="drawer-section-title">Risk Breakdown</div>
    <div class="risk-breakdown">
      <div class="rb-row">
        <div class="rb-label">Success drop component</div>
        <div class="rb-bar-wrap"><div class="rb-bar-fill" style="width:${(r.risk_breakdown.success_component/50)*100}%;background:var(--red)"></div></div>
        <div class="rb-val" style="color:var(--red)">${r.risk_breakdown.success_component}</div>
      </div>
      <div class="rb-row">
        <div class="rb-label">Failure rate component</div>
        <div class="rb-bar-wrap"><div class="rb-bar-fill" style="width:${(r.risk_breakdown.failure_component/30)*100}%;background:var(--orange)"></div></div>
        <div class="rb-val" style="color:var(--orange)">${r.risk_breakdown.failure_component}</div>
      </div>
      <div class="rb-row">
        <div class="rb-label">Intervention rate component</div>
        <div class="rb-bar-wrap"><div class="rb-bar-fill" style="width:${(r.risk_breakdown.intervention_component/20)*100}%;background:var(--yellow)"></div></div>
        <div class="rb-val" style="color:var(--yellow)">${r.risk_breakdown.intervention_component}</div>
      </div>
    </div>` : "";

  document.getElementById("drawerBody").innerHTML = `
    <div>
      <div class="drawer-section-title">Status</div>
      <div style="display:flex;align-items:center;gap:12px;padding:6px 0;">
        <span class="badge ${statusBadgeClass(r.status)}" style="font-size:11px;padding:4px 10px">${statusLabel(r.status)}</span>
        <span style="font-size:20px;font-weight:700;color:${col}">${r.risk_score}<span style="font-size:11px;color:var(--text3)"> / 100</span></span>
      </div>
    </div>

    <div>
      <div class="drawer-section-title">Policy</div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Old version</span>
        <span class="drawer-kv-val" style="color:var(--text2)">${r.old_version}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">New version</span>
        <span class="drawer-kv-val" style="color:var(--accent)">${r.new_version || "Not updated"}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Updated</span>
        <span class="drawer-kv-val" style="color:${r.updated?'var(--green)':'var(--text2)'}">${r.updated ? "Yes" : "No — still on v2.7"}</span>
      </div>
    </div>

    <div>
      <div class="drawer-section-title">Performance Delta</div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Success rate before</span>
        <span class="drawer-kv-val">${r.before_success_rate}%</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Success rate after</span>
        <span class="drawer-kv-val" style="color:${r.after_success_rate < r.before_success_rate ? 'var(--red)' : 'var(--green)'}">${r.after_success_rate !== null ? r.after_success_rate + "%" : "—"}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Success drop</span>
        <span class="drawer-kv-val" style="color:${r.success_drop > 0 ? 'var(--red)' : 'var(--green)'}">${r.success_drop !== null ? (r.success_drop > 0 ? "▲ " : "▼ ") + Math.abs(r.success_drop).toFixed(1) + "pp" : "—"}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Failures before</span>
        <span class="drawer-kv-val">${r.before_failures}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Failures after</span>
        <span class="drawer-kv-val" style="color:${r.after_failures > r.before_failures ? 'var(--red)' : 'var(--green)'}">${r.after_failures !== null ? r.after_failures : "—"}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Intervention rate before</span>
        <span class="drawer-kv-val">1 / ${r.before_intervention_rate ? r.before_intervention_rate.toLocaleString() : "—"}</span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Intervention rate after</span>
        <span class="drawer-kv-val" style="color:${r.after_intervention_rate && r.after_intervention_rate < r.before_intervention_rate ? 'var(--red)' : 'var(--green)'}">
          ${r.after_intervention_rate ? "1 / " + r.after_intervention_rate.toLocaleString() : "—"}
        </span>
      </div>
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Failure mode</span>
        <span class="drawer-kv-val">${r.main_failure_reason.replace(/_/g," ")}</span>
      </div>
      ${r.failure_onset_hour ? `
      <div class="drawer-kv-row">
        <span class="drawer-kv-key">Failure onset</span>
        <span class="drawer-kv-val" style="color:var(--red)">+${r.failure_onset_hour}h post-update</span>
      </div>` : ""}
    </div>

    ${breakdownHtml ? `<div>${breakdownHtml}</div>` : ""}

    <div>
      <div class="drawer-section-title">Finding</div>
      <div class="finding-box">${r.finding}</div>
    </div>
  `;

  document.getElementById("drawerOverlay").classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawerOverlay").classList.remove("open");
}

function handleOverlayClick(e) {
  if (e.target.id === "drawerOverlay") closeDrawer();
}

function toggleSort() {
  sortDescending = !sortDescending;
  document.getElementById("riskHeader").textContent = `Risk ${sortDescending ? "↓" : "↑"}`;
  renderTable(allRobots);
}

function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  renderTable(allRobots);
}

function openRollbackModal() {
  const modal = document.getElementById("rollbackModal");
  document.getElementById("rollbackTs").textContent =
    "Initiated: " + new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  modal.style.display = "flex";
}

function closeRollbackModal() {
  document.getElementById("rollbackModal").style.display = "none";
}

function confirmRollback() {
  closeRollbackModal();

  const badge = document.getElementById("rolloutStatusBadge");
  badge.textContent = "↺ ROLLBACK IN PROGRESS";
  badge.style.background = "rgba(245,168,0,0.1)";
  badge.style.borderColor = "var(--yellow)";
  badge.style.color = "var(--yellow)";

  document.getElementById("blastTitle").textContent = "Rollback Initiated";
  document.getElementById("blastText").textContent =
    "cortex-v2.7 rollback pushed to fleet. Robots pulling updated weights asynchronously — 0 / 17 confirmed.";
  document.getElementById("blastAction").style.display = "none";

  const failedRobots = allRobots.filter(r => r.updated);
  let recovered = 0;
  const total = failedRobots.length;

  const interval = setInterval(() => {
    if (recovered >= total) {
      clearInterval(interval);

      badge.textContent = "✓ ROLLBACK COMPLETE";
      badge.style.background = "rgba(0,217,122,0.1)";
      badge.style.borderColor = "var(--green)";
      badge.style.color = "var(--green)";

      document.getElementById("blastTitle").textContent = "Fleet Stabilized";
      document.getElementById("blastText").textContent =
        `All ${total} robots rolled back to cortex-v2.7. Intervention rates returning to baseline. Monitor for 30 min before re-attempting v2.8 push.`;

      document.getElementById("statFailed").textContent = "0";
      document.getElementById("statFailed").style.color = "var(--text3)";
      document.getElementById("statRegressed").textContent = "0";
      document.getElementById("statPicksLost").textContent = "0";
      return;
    }

    const r = failedRobots[recovered];
    r.status = "HEALTHY_UPDATE";
    r.risk_score = Math.floor(Math.random() * 8) + 2;
    recovered++;

    document.getElementById("blastText").textContent =
      `cortex-v2.7 rollback pushed to fleet. Robots pulling updated weights asynchronously — ${recovered} / ${total} confirmed.`;

    renderTable(allRobots);

  }, 800); // one robot recovers every 800ms
}

async function generateCharts() {
  const btn = document.getElementById("generateChartsBtn");
  btn.textContent = "Generating…";
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/generate-charts`, { method: "POST" });
    if (!res.ok) throw new Error("Generation failed");

    const ts = Date.now();
    const riskImg = document.getElementById("riskChart");
    const hmImg   = document.getElementById("heatmapChart");

    riskImg.src = `${API}/outputs/risk_chart.png?t=${ts}`;
    hmImg.src   = `${API}/outputs/failure_heatmap.png?t=${ts}`;

    riskImg.onload = () => {
      riskImg.classList.remove("hidden");
      document.getElementById("riskPlaceholder").style.display = "none";
    };
    hmImg.onload = () => {
      hmImg.classList.remove("hidden");
      document.getElementById("heatmapPlaceholder").style.display = "none";
    };
  } catch (err) {
    alert("Chart generation failed. Is the backend running on port 5000?");
  } finally {
    btn.textContent = "Generate Charts";
    btn.disabled = false;
  }
}

async function init() {
  try {
    const res = await fetch(`${API}/api/rollout`);
    if (!res.ok) throw new Error("Backend unreachable");

    const data = await res.json();
    allRobots = data.robots;

    renderStats(data);
    renderTable(allRobots);
    renderFailureClusters(data.failure_summary);
    renderSites(data.site_aggregates);
  } catch (err) {
    document.querySelector(".app").innerHTML = `
      <div style="padding:40px 24px;color:var(--text2);font-size:13px;">
        <div style="font-size:16px;font-weight:700;color:var(--red);margin-bottom:8px;">Backend not reachable</div>
        <div style="color:var(--text3)">Start the backend first: <code style="color:var(--accent)">cd backend && npm run dev</code></div>
      </div>`;
  }
}

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  document.getElementById("generateChartsBtn").style.display = "block";
  document.getElementById("generateChartsBtn").addEventListener("click", generateCharts);
}

init();
