from PIL import Image
p = r"C:/Users/toshr/Pictures/Screenshots/Screenshot 2026-09-28 132735.png"
im = Image.open(p).convert("RGB")
W,H = im.size
# line 1 right half
b1 = (int(W*0.45), int(H*0.735), W, int(H*0.80))
c1 = im.crop(b1); c1 = c1.resize((c1.width*5, c1.height*5), Image.LANCZOS); c1.save("crop_l1b.png")
# line 2 full
b2 = (0, int(H*0.795), W, int(H*0.86))
c2 = im.crop(b2); c2 = c2.resize((c2.width*4, c2.height*4), Image.LANCZOS); c2.save("crop_l2b.png")
# line 3 full
b3 = (0, int(H*0.855), W, int(H*0.92))
c3 = im.crop(b3); c3 = c3.resize((c3.width*4, c3.height*4), Image.LANCZOS); c3.save("crop_l3b.png")
print("ok")
