import json, os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

BASE_DIR    = os.path.dirname(os.path.dirname(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "data", "sample-robots.json")
OUTPUT_PATH = os.path.join(BASE_DIR, "outputs", "failure_heatmap.png")

with open(DATA_PATH) as f:
    robots = json.load(f)

FAILURE_MODES = ["grip_slip", "object_misread", "place_failure", "recovery_timeout"]
MODE_LABELS   = ["Grip Slip", "Object Misread", "Place Failure", "Recovery Timeout"]

sites_order = []
seen = set()
for r in robots:
    sl = r["site_label"]
    if sl not in seen:
        sites_order.append(sl)
        seen.add(sl)

matrix = np.zeros((len(sites_order), len(FAILURE_MODES)), dtype=int)
risk_matrix = np.zeros((len(sites_order), len(FAILURE_MODES)), dtype=float)

for r in robots:
    if not r["updated"] or r["main_failure_reason"] in ("none", "not_updated"):
        continue
    si = sites_order.index(r["site_label"])
    if r["main_failure_reason"] in FAILURE_MODES:
        fi = FAILURE_MODES.index(r["main_failure_reason"])
        matrix[si][fi] += 1
        # weight by success drop
        drop = r["before_success_rate"] - (r["after_success_rate"] or r["before_success_rate"])
        risk_matrix[si][fi] = max(risk_matrix[si][fi], drop)

fig, ax = plt.subplots(figsize=(10, 5))
fig.patch.set_facecolor("#0a0c0f")
ax.set_facecolor("#111318")

cmap = mcolors.LinearSegmentedColormap.from_list(
    "riskmap",
    ["#111318", "#ff7a3022", "#ff7a30", "#ff3b5c"],
    N=256
)

im = ax.imshow(risk_matrix, cmap=cmap, aspect="auto", vmin=0, vmax=25)

for i in range(len(sites_order)):
    for j in range(len(FAILURE_MODES)):
        val = matrix[i][j]
        risk = risk_matrix[i][j]
        if val > 0:
            txt_col = "#fff" if risk > 10 else "#ffb800"
            ax.text(j, i, f"{val}R\n{risk:.0f}pp",
                    ha="center", va="center", fontsize=8.5,
                    fontweight="bold", color=txt_col, fontfamily="monospace")
        else:
            ax.text(j, i, "—", ha="center", va="center",
                    fontsize=10, color="#252d3a", fontfamily="monospace")

ax.set_xticks(range(len(FAILURE_MODES)))
ax.set_xticklabels(MODE_LABELS, fontsize=9, color="#8899aa", fontfamily="monospace")
ax.set_yticks(range(len(sites_order)))
ax.set_yticklabels(sites_order, fontsize=9, color="#8899aa", fontfamily="monospace")
ax.xaxis.set_ticks_position("top")
ax.xaxis.set_label_position("top")

ax.set_title(
    "Failure Mode × Site Heatmap  (R = robots affected, pp = success drop)",
    color="#e2e8f0", fontsize=10, fontweight="bold", fontfamily="monospace", pad=16
)

for x in np.arange(-0.5, len(FAILURE_MODES), 1):
    ax.axvline(x, color="#1e2430", linewidth=0.8)
for y in np.arange(-0.5, len(sites_order), 1):
    ax.axhline(y, color="#1e2430", linewidth=0.8)

ax.tick_params(colors="#4a5568", length=0)
for spine in ax.spines.values():
    spine.set_edgecolor("#1e2430")

cb = plt.colorbar(im, ax=ax, fraction=0.03, pad=0.02)
cb.set_label("Max success drop (pp)", color="#8899aa", fontsize=8, fontfamily="monospace")
cb.ax.yaxis.set_tick_params(color="#4a5568", labelcolor="#8899aa", labelsize=8)
cb.outline.set_edgecolor("#252d3a")

plt.tight_layout(pad=1.2)
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
plt.savefig(OUTPUT_PATH, dpi=160, facecolor=fig.get_facecolor())
plt.close()
print(f"Saved: {OUTPUT_PATH}")
