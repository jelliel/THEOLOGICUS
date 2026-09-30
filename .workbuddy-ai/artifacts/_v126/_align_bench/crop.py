from PIL import Image
import sys
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
print("SIZE", im.size)
W,H = im.size
# crop bottom third (the "En revanche" list)
box = (0, int(H*0.66), W, H)
c = im.crop(box)
c = c.resize((c.width*3, c.height*3), Image.LANCZOS)
c.save("crop_list.png")
print("saved crop_list.png", c.size)
# crop line 1 only
b1 = (0, int(H*0.735), W, int(H*0.80))
c1 = im.crop(b1); c1 = c1.resize((c1.width*3, c1.height*3), Image.LANCZOS); c1.save("crop_l1.png")
b2 = (0, int(H*0.80), W, int(H*0.875))
c2 = im.crop(b2); c2 = c2.resize((c2.width*3, c2.height*3), Image.LANCZOS); c2.save("crop_l2.png")
print("ok")
