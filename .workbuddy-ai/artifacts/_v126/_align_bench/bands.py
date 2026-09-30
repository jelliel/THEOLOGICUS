from PIL import Image
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
W,H = im.size
px = im.load()
T=(119,75,246); TOL=45
def ishl(c): return abs(c[0]-T[0])<TOL and abs(c[1]-T[1])<TOL and abs(c[2]-T[2])<TOL
rows={}
for y in range(H):
    xs=[x for x in range(W) if ishl(px[x,y])]
    if xs: rows[y]=(min(xs),max(xs),len(xs))
ys=sorted(rows)
bands=[]
cur=[ys[0]]
for y in ys[1:]:
    if y-cur[-1]<=2: cur.append(y)
    else: bands.append(cur); cur=[y]
bands.append(cur)
print("BANDS (y0-y1, xmin, xmax):")
for b in bands:
    xmin=min(rows[y][0] for y in b); xmax=max(rows[y][1] for y in b)
    print(f"   y {b[0]}-{b[-1]}   x {xmin} -> {xmax}   (largeur {xmax-xmin+1}px)")
