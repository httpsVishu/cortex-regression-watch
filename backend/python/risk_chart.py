import json, os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

BASE_DIR    = os.path.dirname(os.path.dirname(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "data", "sample-robots.json")
OUTPUT_PATH = os.path.join(BASE_DIR, "outputs", "risk_chart.png")

def compute_risk(r):
    if not r["updated"]:
        return 50, 0, 0, 0
    drop   = r["before_success_rate"] - r["after_success_rate"]
    fmult  = r["after_failures"] / max(r["before_failures"], 1)
    iv_b   = r.get("before_intervention_rate") or 0
    iv_a   = r.get("after_intervention_rate")  or 0
    iv_drop = (iv_b - iv_a) / iv_b if iv_b else 0

    sc = min(50, max(0, drop * 2.8))
    fc = min(30, max(0, (fmult - 1) * 12))
    ic = min(20, max(0, iv_drop * 28))
    return round(sc + fc + ic), sc, fc, ic

def status_color(score, updated):
    if not updated:  return "#64748b"
    if score >= 75:  return "#ff3b5c"
    if score >= 40:  return "#ff7a30"
    if score >= 15:  return "#ffb800"
    return "#00e887"

with open(DATA_PATH) as f:
    robots = json.load(f)

ids, scores, sc_list, fc_list, ic_list, colors = [], [], [], [], [], []
for r in robots:
    total, sc, fc, ic = compute_risk(r)
    ids.append(r["robot_id"])
    scores.append(total)
    sc_list.append(sc)
    fc_list.append(fc)
    ic_list.append(ic)
    colors.append(status_color(total, r["updated"]))

fig, ax = plt.subplots(figsize=(14, 5.5))
fig.patch.set_facecolor("#0a0c0f")
ax.set_facecolor("#111318")

x = np.arange(len(ids))
w = 0.6

b1 = ax.bar(x, sc_list, width=w, color="#ff3b5c", alpha=0.85, label="Success drop")
b2 = ax.bar(x, fc_list, width=w, bottom=sc_list, color="#ff7a30", alpha=0.85, label="Failure rate")
b3 = ax.bar(x, ic_list, width=w, bottom=np.array(sc_list)+np.array(fc_list), color="#ffb800", alpha=0.85, label="Intervention drop")

for i, (score, col) in enumerate(zip(scores, colors)):
    ax.text(i, score + 1.5, str(score), ha="center", va="bottom",
            fontsize=8, fontweight="bold", color=col, fontfamily="monospace")

for y_val, label, col in [(75, "CRITICAL", "#ff3b5c"), (40, "REGRESSED", "#ff7a30"), (15, "DEGRADED", "#ffb800")]:
    ax.axhline(y_val, color=col, linewidth=0.8, linestyle="--", alpha=0.5)
    ax.text(len(ids) - 0.3, y_val + 0.8, label, ha="right", va="bottom",
            fontsize=7, color=col, alpha=0.7, fontfamily="monospace")

ax.set_xticks(x)
ax.set_xticklabels(ids, rotation=35, ha="right", fontsize=8,
                   color="#8899aa", fontfamily="monospace")
ax.set_ylim(0, 105)
ax.set_ylabel("Risk Score (0–100)", color="#8899aa", fontsize=9, fontfamily="monospace")
ax.set_title("Robot Risk Score — cortex-v2.7 → v2.8 Rollout", color="#e2e8f0",
             fontsize=11, fontweight="bold", fontfamily="monospace", pad=12)

ax.tick_params(colors="#4a5568", which="both")
ax.spines["bottom"].set_color("#1e2430")
ax.spines["left"].set_color("#1e2430")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.yaxis.grid(True, color="#1e2430", linewidth=0.6)
ax.set_axisbelow(True)

legend = ax.legend(
    handles=[
        mpatches.Patch(color="#ff3b5c", label="Success drop component"),
        mpatches.Patch(color="#ff7a30", label="Failure rate component"),
        mpatches.Patch(color="#ffb800", label="Intervention rate component"),
    ],
    loc="upper right", fontsize=8, framealpha=0.15,
    facecolor="#161b22", edgecolor="#252d3a",
    labelcolor="#8899aa"
)

plt.tight_layout(pad=1.2)
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
plt.savefig(OUTPUT_PATH, dpi=160, facecolor=fig.get_facecolor())
plt.close()
print(f"Saved: {OUTPUT_PATH}")
