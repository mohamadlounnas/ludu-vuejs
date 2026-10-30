#!/usr/bin/env python3
"""stitch.py out.png COLUMNS img1 label1 img2 label2 ... — labelled contact sheet."""
import sys

from PIL import Image, ImageDraw, ImageFont

out, cols, rest = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
items = [(Image.open(rest[i]).convert("RGB"), rest[i + 1]) for i in range(0, len(rest), 2)]
w, h = items[0][0].size
pad, label_h = 6, 28
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + label_h + pad) + pad), "#1d1d24")
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
except OSError:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for i, (img, label) in enumerate(items):
    x = pad + (i % cols) * (w + pad)
    y = pad + (i // cols) * (h + label_h + pad)
    sheet.paste(img, (x, y))
    d.text((x + 4, y + h + 4), label, fill="#ffd23f", font=font)
sheet.save(out)
