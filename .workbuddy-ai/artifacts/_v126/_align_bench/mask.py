from PIL import Image
from collections import Counter
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
W,H = im.size
px = im.load()
cnt = Counter()
for y in range(H):
    for x in range(W):
        cnt[px[x,y]] += 1
print("top colors:")
for c,n in cnt.most_common(12):
    print("  ", c, n)
