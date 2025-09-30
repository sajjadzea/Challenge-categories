import shutil, os, pandas as pd
os.makedirs("docs/data", exist_ok=True)
# کپی CSVها
for f in ["problems.csv","edges.csv","stakeholders.csv","stakeholder_links.csv","comms_matrix.csv","risk_register.csv"]:
    src=os.path.join("data",f)
    if os.path.exists(src): shutil.copy(src, os.path.join("docs","data",f))
# خلاصه درایورها
mic = os.path.join("docs","data","micmac.csv")
if os.path.exists(mic):
    sumr = pd.read_csv(mic).sort_values("influence", ascending=False).head(10)
    sumr.to_csv("docs/data/top_drivers.csv", index=False)
# کپی وب به docs
if os.path.exists("web"):
    shutil.copytree("web", "docs", dirs_exist_ok=True)
print("Reports updated in docs/")
