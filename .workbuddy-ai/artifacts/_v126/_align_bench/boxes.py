from PIL import Image
import sys
sys.setrecursionlimit(10000)
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
W,H = im.size
px = im.load()
TARGET = (119,75,246); TOL = 40
def ishl(c):
    return abs(c[0]-TARGET[0])<TOL and abs(c[1]-TARGET[1])<TOL and abs(c[2]-TARGET[2])<TOL
mask = [[ishl(px[x,y]) for x in range(W)] for y in range(H)]
seen = [[False]*W for _ in range(H)]
regions = []
for y0 in range(H):
    for x0 in range(W):
        if mask[y0][x0] and not seen[y0][x0]:
            stack=[(x0,y0)]; seen[y0][x0]=True
            minx=maxx=x0; miny=maxy=y0; n=0
            while stack:
                x,y=stack.pop(); n+=1
                if x<minx:minx=x
                if x>maxx:maxx=x
                if y<miny:miny=y
                if y>maxy:maxy=y
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx,ny=x+dx,y+dy
                    if 0<=nx<W and 0<=ny<H and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx]=True; stack.append((nx,ny))
            if n>60:
                regions.append((minx,miny,maxx,maxy,n))
regions.sort(key=lambda r:(r[1],r[0]))
print("HIGHLIGHT REGIONS (x0,y0,x1,y1,pixels):")
for r in regions:
    print("   ", r, " width=", r[2]-r[0]+1)
im2 = im.copy()
from PIL import ImageDraw
d = ImageDraw.Draw(im2)
for r in regions:
    d.rectangle([r[0]-1,r[1]-1,r[2]+1,r[3]+1], outline=(0,255,0))
im2 = im2.resize((im2.width*2, im2.height*2), Image.LANCZOS)
im2.save("annotated.png")
print("saved annotated.png")
