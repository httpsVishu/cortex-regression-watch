const express = require("express");
const cors    = require("cors");
const path    = require("path");
const { exec } = require("child_process");

const robots = require("./data/sample-robots.json");
const { analyzeFleet } = require("./services/analyzeRollout");

const app  = express();
const PORT = process.env.PORT || 5000;

//app.use(cors());
//app.use(cors({ origin: "*" }));
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/outputs", express.static(path.join(__dirname, "outputs")));

app.get("/", (req, res) => {
  res.send("Cortex Regression Watch — backend running.");
});

app.get("/api/rollout", (req, res) => {
  const result = analyzeFleet(robots);
  res.json(result);
});

app.get("/api/health", (req, res) => {
  const result = analyzeFleet(robots);
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    robots_loaded: robots.length,
    last_analysis: {
      total: result.total,
      failed: result.failed,
      recommendation: result.blast_radius.rollback_recommendation,
    }
  });
});

app.post("/api/generate-charts", (req, res) => {
  const cmd = `python python/risk_chart.py && python python/failure_heatmap.py`;
  exec(cmd, { cwd: __dirname }, (error) => {
    if (error) {
      return res.status(500).json({ error: "Chart generation failed", details: error.message });
    }
    res.json({
      message: "Charts generated",
      risk_chart:    "http://localhost:5000/outputs/risk_chart.png",
      failure_heatmap: "http://localhost:5000/outputs/failure_heatmap.png",
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});