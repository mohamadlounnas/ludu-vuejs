#!/usr/bin/env python3
"""Draw review notes on a screenshot.

    python3 tools/review/annotate.py in.png out.png notes.json

notes.json is a list of shapes, in the screenshot's own pixel coordinates:
  {"type": "circle", "x": 120, "y": 340, "r": 40, "label": "1"}
  {"type": "box", "x0": 10, "y0": 20, "x1": 200, "y1": 90, "label": "2"}
  {"type": "arrow", "x0": 300, "y0": 300, "x1": 200, "y1": 200}
  {"type": "text", "x": 20, "y": 20, "text": "free text"}
Optional on every shape: "color" (default "#ff2d55").
A top-level {"title": "...", "notes": [...], "legend": ["1: ...", "2: ..."]} object
is also accepted; the legend is printed in a panel under the screenshot.
"""
import json
import math
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def tag(draw, x, y, label, color, scale):
    if not label:
        return
    f = font(int(22 * scale))
    w = draw.textlength(str(label), font=f) + 14 * scale
    h = 30 * scale
    draw.rounded_rectangle([x, y - h, x + w, y], radius=8 * scale, fill=color)
    draw.text((x + 7 * scale, y - h + 3 * scale), str(label), fill="white", font=f)


def main(src, dst, notes_path):
    data = json.load(open(notes_path))
    if isinstance(data, list):
        data = {"notes": data}
    img = Image.open(src).convert("RGB")
    scale = max(1.0, img.width / 800)
    draw = ImageDraw.Draw(img)
    width = int(4 * scale)
    for n in data.get("notes", []):
        color = n.get("color", "#ff2d55")
        kind = n["type"]
        if kind == "circle":
            x, y, r = n["x"], n["y"], n["r"]
            draw.ellipse([x - r, y - r, x + r, y + r], outline=color, width=width)
            tag(draw, x + r * 0.7, y - r * 0.7, n.get("label"), color, scale)
        elif kind == "box":
            draw.rounded_rectangle([n["x0"], n["y0"], n["x1"], n["y1"]], radius=10 * scale, outline=color, width=width)
            tag(draw, n["x0"], n["y0"], n.get("label"), color, scale)
        elif kind == "arrow":
            x0, y0, x1, y1 = n["x0"], n["y0"], n["x1"], n["y1"]
            draw.line([x0, y0, x1, y1], fill=color, width=width)
            a = math.atan2(y1 - y0, x1 - x0)
            head = 18 * scale
            for da in (2.6, -2.6):
                draw.line([x1, y1, x1 + head * math.cos(a + da), y1 + head * math.sin(a + da)], fill=color, width=width)
            tag(draw, x0, y0, n.get("label"), color, scale)
        elif kind == "text":
            f = font(int(n.get("size", 24) * scale))
            draw.text((n["x"] + 2, n["y"] + 2), n["text"], fill="white", font=f)
            draw.text((n["x"], n["y"]), n["text"], fill=color, font=f)

    legend = ([data["title"]] if data.get("title") else []) + data.get("legend", [])
    if legend:
        f = font(int(20 * scale))
        line_h = int(28 * scale)
        lines = []
        for entry in legend:  # naive wrap
            words, cur = entry.split(), ""
            for w in words:
                trial = (cur + " " + w).strip()
                if draw.textlength(trial, font=f) > img.width - 30 * scale:
                    lines.append(cur)
                    cur = w
                else:
                    cur = trial
            lines.append(cur)
        panel = Image.new("RGB", (img.width, img.height + line_h * len(lines) + int(20 * scale)), "#1d1d24")
        panel.paste(img, (0, 0))
        d = ImageDraw.Draw(panel)
        for i, line in enumerate(lines):
            d.text((15 * scale, img.height + 10 * scale + i * line_h), line, fill="#ffd23f" if i == 0 and data.get("title") else "white", font=f)
        img = panel
    img.save(dst)


if __name__ == "__main__":
    main(*sys.argv[1:4])
