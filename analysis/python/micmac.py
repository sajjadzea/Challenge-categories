import pandas as pd, numpy as np, os
p = pd.read_csv("data/problems.csv")
edges = pd.read_csv("data/edges.csv")
nodes = p["id"].tolist()
idx = {n:i for i,n in enumerate(nodes)}
A = np.zeros((len(nodes), len(nodes)))
for _,e in edges.iterrows():
    if e["source"] in idx and e["target"] in idx:
        w = float(e.get("weight",1))
        A[idx[e["source"]], idx[e["target"]]] += w
direct_influence = A.sum(axis=1)
direct_depend   = A.sum(axis=0)
A2, A3 = A@A, A@A@A
indirect_influence = (A + A2 + A3).sum(axis=1)
indirect_depend   = (A + A2 + A3).sum(axis=0)
df = pd.DataFrame({
    "id": nodes,
    "influence": direct_influence + indirect_influence,
    "dependence": direct_depend + indirect_depend
})
def micmac_class(r):
    I = r.influence; D = r.dependence
    if I>0 and D>0:  return "Linkage" if D>I else "Driver"
    if I>0 and D==0: return "Driver"
    if D>0 and I==0: return "Dependent"
    return "Autonomous"
df["micmac_class"] = df.apply(micmac_class, axis=1)
os.makedirs("docs/data", exist_ok=True)
df.to_csv("docs/data/micmac.csv", index=False)
print("Wrote docs/data/micmac.csv")
