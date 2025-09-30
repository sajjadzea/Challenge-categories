import pandas as pd, os
problems = pd.read_csv("data/problems.csv")
problems["U_high"] = problems["uncertainty"] >= 3
problems["I_high"] = problems["impact"] >= 3
def route(row):
    if row.I_high and not row.U_high: return "COMMIT"
    if row.I_high and row.U_high:     return "EXPLORE"
    if not row.I_high and row.U_high: return "PARK"
    return "DEFER/AUTO"
problems["route"] = problems.apply(route, axis=1)
os.makedirs("docs/data", exist_ok=True)
problems.to_csv("docs/data/problems_enriched.csv", index=False)
print("Wrote docs/data/problems_enriched.csv")
