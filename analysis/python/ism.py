import pandas as pd, numpy as np, os
p = pd.read_csv("data/problems.csv")
edges = pd.read_csv("data/edges.csv")
nodes = p["id"].tolist(); n=len(nodes); idx={n:i for i,n in enumerate(nodes)}
R = np.zeros((n,n), dtype=int)
for i in range(n): R[i,i]=1
for _,e in edges.iterrows():
    if e["source"] in idx and e["target"] in idx:
        R[idx[e["source"]], idx[e["target"]]]=1
for k in range(n):
    for i in range(n):
        if R[i,k]:
            R[i,:] = np.logical_or(R[i,:], R[k,:])
levels=[]; used=set()
while len(used)<n:
    lvl=[nodes[i] for i in range(n) if i not in used and all(R[i,j]==0 or j in used or j==i for j in range(n))]
    if not lvl:
        remaining=[nodes[i] for i in range(n) if i not in used]
        if remaining:
            levels.append(remaining)
            used.update(idx[x] for x in remaining)
        break
    levels.append(lvl); used.update(idx[x] for x in lvl)
rows=[]
for li,l in enumerate(levels, start=1):
    for node in l: rows.append({"id":node,"level":li})
df=pd.DataFrame(rows)
os.makedirs("docs/data", exist_ok=True)
df.to_csv("docs/data/ism_levels.csv", index=False)
print("Wrote docs/data/ism_levels.csv")
