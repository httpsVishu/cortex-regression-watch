function computeRiskScore(robot) {
  if (!robot.updated) return 50;

  const successDrop = robot.before_success_rate - robot.after_success_rate;
  const failureMultiplier = robot.after_failures / Math.max(robot.before_failures, 1);
  const interventionDrop = robot.before_intervention_rate && robot.after_intervention_rate
    ? (robot.before_intervention_rate - robot.after_intervention_rate) / robot.before_intervention_rate
    : 0;

  // Component weights
  const successComponent   = Math.min(50, Math.max(0, successDrop * 2.8));        // 0–50 pts
  const failureComponent   = Math.min(30, Math.max(0, (failureMultiplier - 1) * 12)); // 0–30 pts
  const interventionComp   = Math.min(20, Math.max(0, interventionDrop * 28));     // 0–20 pts

  return Math.round(successComponent + failureComponent + interventionComp);
}

function classifyStatus(score, updated) {
  if (!updated)  return "NOT_UPDATED";
  if (score >= 75) return "FAILED_UPDATE";
  if (score >= 40) return "REGRESSED";
  if (score >= 15) return "DEGRADED";
  return "HEALTHY_UPDATE";
}

function buildFinding(robot, score, status) {
  if (status === "NOT_UPDATED") {
    return `${robot.robot_id} has not received cortex-v2.8. ${robot.notes || ""}`.trim();
  }
  if (status === "FAILED_UPDATE") {
    const drop = (robot.before_success_rate - robot.after_success_rate).toFixed(1);
    const fmult = (robot.after_failures / Math.max(robot.before_failures, 1)).toFixed(1);
    return `Critical regression. Pick success dropped ${drop}pp. Failure count ${fmult}× baseline. Primary mode: ${robot.main_failure_reason}. ${robot.notes || ""}`.trim();
  }
  if (status === "REGRESSED") {
    const drop = (robot.before_success_rate - robot.after_success_rate).toFixed(1);
    return `Moderate regression. ${drop}pp success drop. Monitoring required. ${robot.notes || ""}`.trim();
  }
  if (status === "DEGRADED") {
    return `Minor degradation within acceptable range. Watch for trend. ${robot.notes || ""}`.trim();
  }
  return `Clean update. No significant regression detected. ${robot.notes || ""}`.trim();
}

function analyzeRobot(robot) {
  const score = computeRiskScore(robot);
  const status = classifyStatus(score, robot.updated);
  const successDrop = robot.updated && robot.after_success_rate !== null
    ? parseFloat((robot.before_success_rate - robot.after_success_rate).toFixed(2))
    : null;
  const failureIncrease = robot.updated && robot.after_failures !== null
    ? robot.after_failures - robot.before_failures
    : null;
  const interventionDelta = robot.updated && robot.after_intervention_rate !== null
    ? robot.after_intervention_rate - robot.before_intervention_rate
    : null;

  return {
    ...robot,
    status,
    risk_score: score,
    success_drop: successDrop,
    failure_increase: failureIncrease,
    intervention_delta: interventionDelta,
    risk_breakdown: robot.updated ? {
      success_component: Math.min(50, Math.max(0, parseFloat(((robot.before_success_rate - (robot.after_success_rate || robot.before_success_rate)) * 2.8).toFixed(1)))),
      failure_component: Math.min(30, Math.max(0, parseFloat((((robot.after_failures || robot.before_failures) / Math.max(robot.before_failures, 1)) - 1) * 12)).toFixed(1)),
      intervention_component: robot.before_intervention_rate && robot.after_intervention_rate
        ? Math.min(20, Math.max(0, parseFloat(((robot.before_intervention_rate - robot.after_intervention_rate) / robot.before_intervention_rate * 28).toFixed(1))))
        : 0,
    } : null,
    finding: buildFinding(robot, score, status),
  };
}

function getFailureSummary(robots) {
  const summary = {};
  robots.forEach(r => {
    if (r.main_failure_reason && r.main_failure_reason !== "none" && r.main_failure_reason !== "not_updated") {
      if (!summary[r.main_failure_reason]) summary[r.main_failure_reason] = { count: 0, robots: [], avg_risk: 0 };
      summary[r.main_failure_reason].count++;
      summary[r.main_failure_reason].robots.push(r.robot_id);
    }
  });
  // attach avg risk score per failure mode
  Object.keys(summary).forEach(mode => {
    const affected = robots.filter(r => r.main_failure_reason === mode);
    summary[mode].avg_risk = Math.round(affected.reduce((s, r) => s + (r.risk_score || 0), 0) / affected.length);
  });
  return summary;
}

function getSiteAggregates(robots) {
  const sites = {};
  robots.forEach(r => {
    if (!sites[r.site]) sites[r.site] = { site_id: r.site, site_label: r.site_label, robots: [] };
    sites[r.site].robots.push(r);
  });

  return Object.values(sites).map(s => {
    const updated = s.robots.filter(r => r.updated);
    const failed  = s.robots.filter(r => r.status === "FAILED_UPDATE");
    const avgRisk = updated.length
      ? Math.round(updated.reduce((a, r) => a + r.risk_score, 0) / updated.length)
      : 0;
    const avgSuccessDrop = updated.filter(r => r.success_drop !== null).length
      ? parseFloat((updated.filter(r => r.success_drop !== null).reduce((a, r) => a + r.success_drop, 0) / updated.filter(r => r.success_drop !== null).length).toFixed(2))
      : 0;
    return {
      site_id: s.site_id,
      site_label: s.site_label,
      total: s.robots.length,
      updated: updated.length,
      failed: failed.length,
      avg_risk_score: avgRisk,
      avg_success_drop: avgSuccessDrop,
      blast_radius_pct: Math.round((failed.length / s.robots.length) * 100),
    };
  }).sort((a, b) => b.avg_risk_score - a.avg_risk_score);
}

function getBlastRadius(robots) {
  const failed  = robots.filter(r => r.status === "FAILED_UPDATE");
  const regressed = robots.filter(r => r.status === "REGRESSED" || r.status === "DEGRADED");
  const notUpdated = robots.filter(r => r.status === "NOT_UPDATED");

  // Estimated picks/hr impact: assume ~2000 picks/hr per robot baseline, degraded by success drop
  const picksImpactPerHr = failed.reduce((sum, r) => {
    const dropFraction = (r.success_drop || 0) / 100;
    return sum + Math.round(2000 * dropFraction);
  }, 0);

  return {
    critical_robots: failed.length,
    affected_sites: [...new Set(failed.map(r => r.site))].length,
    not_updated_robots: notUpdated.length,
    estimated_failed_picks_per_hr: picksImpactPerHr,
    rollback_recommendation: failed.length >= 3 || picksImpactPerHr > 5000
      ? "ROLLBACK_ADVISED"
      : failed.length >= 1
        ? "MONITOR_CLOSELY"
        : "STABLE",
  };
}

function analyzeFleet(robots) {
  const analyzed = robots.map(analyzeRobot);

  return {
    total: analyzed.length,
    healthy:     analyzed.filter(r => r.status === "HEALTHY_UPDATE").length,
    degraded:    analyzed.filter(r => r.status === "DEGRADED").length,
    regressed:   analyzed.filter(r => r.status === "REGRESSED").length,
    failed:      analyzed.filter(r => r.status === "FAILED_UPDATE").length,
    not_updated: analyzed.filter(r => r.status === "NOT_UPDATED").length,
    failure_summary: getFailureSummary(analyzed),
    site_aggregates: getSiteAggregates(analyzed),
    blast_radius: getBlastRadius(analyzed),
    robots: analyzed,
  };
}

module.exports = { analyzeFleet };
