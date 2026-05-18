const { analyzeFleet } = require("../services/analyzeRollout");

const makeRobot = (overrides) => ({
  robot_id: "TEST-01",
  site: "test-site",
  site_label: "Test Site",
  robot_type: "single-arm-pick",
  gripper: "suction",
  old_version: "cortex-v2.7",
  new_version: "cortex-v2.8",
  updated: true,
  before_success_rate: 96,
  after_success_rate: 96,
  before_failures: 40,
  after_failures: 40,
  before_intervention_rate: 50000,
  after_intervention_rate: 50000,
  main_failure_reason: "none",
  failure_onset_hour: null,
  notes: "",
  ...overrides,
});

test("HEALTHY_UPDATE — no regression", () => {
  const result = analyzeFleet([makeRobot()]);
  expect(result.robots[0].status).toBe("HEALTHY_UPDATE");
  expect(result.robots[0].risk_score).toBeLessThan(15);
});

test("DEGRADED — small success drop", () => {
  const result = analyzeFleet([makeRobot({
    after_success_rate: 91,
    after_failures: 55,
    after_intervention_rate: 44000,
  })]);
  expect(result.robots[0].status).toBe("DEGRADED");
  expect(result.robots[0].risk_score).toBeGreaterThanOrEqual(15);
  expect(result.robots[0].risk_score).toBeLessThan(40);
});

test("REGRESSED — moderate drop", () => {
  const result = analyzeFleet([makeRobot({
    after_success_rate: 88,
    after_failures: 90,
    after_intervention_rate: 30000,
  })]);
  expect(result.robots[0].status).toBe("REGRESSED");
  expect(result.robots[0].risk_score).toBeGreaterThanOrEqual(40);
  expect(result.robots[0].risk_score).toBeLessThan(75);
});

test("FAILED_UPDATE — critical drop", () => {
  const result = analyzeFleet([makeRobot({
    after_success_rate: 70,
    after_failures: 200,
    after_intervention_rate: 8000,
    main_failure_reason: "grip_slip",
  })]);
  expect(result.robots[0].status).toBe("FAILED_UPDATE");
  expect(result.robots[0].risk_score).toBeGreaterThanOrEqual(75);
});

test("NOT_UPDATED — robot skipped rollout", () => {
  const result = analyzeFleet([makeRobot({
    updated: false,
    new_version: null,
    after_success_rate: null,
    after_failures: null,
    after_intervention_rate: null,
  })]);
  expect(result.robots[0].status).toBe("NOT_UPDATED");
  expect(result.robots[0].risk_score).toBe(50);
});

test("blast radius fires ROLLBACK_ADVISED with 3+ failed robots", () => {
  const failed = makeRobot({
    after_success_rate: 70,
    after_failures: 200,
    after_intervention_rate: 8000,
  });
  const result = analyzeFleet([failed, failed, failed]);
  expect(result.blast_radius.rollback_recommendation).toBe("ROLLBACK_ADVISED");
});