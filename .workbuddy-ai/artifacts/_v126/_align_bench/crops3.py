from PIL import Image
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
W,H = im.size
bands = [(50,57,55,209),(76,82,63,189),(330,337,597,722),(356,362,20,530)]
for i,(y0,y1,x0,x1) in enumerate(bands,1):
    cx0=max(0,x0-90); cx1=min(W,x1+30)
    cy0=max(0,y0-14); cy1=min(H,y1+14)
    c=im.crop((cx0,cy0,cx1,cy1))
    c=c.resize((c.width*6,c.height*6), Image.LANCZOS)
    c.save(f"band{i}.png")
    print(f"band{i}.png  x {cx0}->{cx1}  y {cy0}->{cy1}   (box x {x0}->{x1})")
