#!/usr/bin/env python3
"""Generates Gemma launcher icons (dark + light) as Android resources.
Usage: python3 tools/icons.py <android-res-dir> [preview-dir]
Word outlines were extracted from Lalezar (OFL) so no font is needed at build time."""
import os, subprocess, sys, tempfile

MAIN = "M271 -93Q271 -45 265 -22.5Q259 0 244 0Q189 0 137.5 -7Q86 -14 51 -29Q42 -65 36 -354L30 -557L191 -566Q200 -417 200 -292Q200 -254 198 -190Q223 -186 244 -186Q260 -186 265.5 -163Q271 -140 271 -93Z M803 -93Q803 -45 797 -22.5Q791 0 776 0Q714 0 675 -39Q641 6 586 6Q546 6 502.5 -16Q459 -38 420 -74Q387 -38 342.5 -19Q298 0 244 0Q229 0 223 -22.5Q217 -45 217 -93Q217 -140 222.5 -163Q228 -186 244 -186Q289 -186 322.5 -200.5Q356 -215 378.5 -236Q401 -257 431 -292Q467 -335 495.5 -356.5Q524 -378 566 -378Q616 -378 652.5 -345Q689 -312 705 -256Q717 -219 731.5 -202.5Q746 -186 776 -186Q792 -186 797.5 -163Q803 -140 803 -93ZM632 -178Q631 -192 612.5 -202Q594 -212 562 -212Q517 -212 482 -191Q500 -178 526 -172Q552 -166 578 -166Q596 -166 612 -169.5Q628 -173 632 -178Z M937 284V279Q973 263 1019.5 251.5Q1066 240 1108 235Q1116 257 1116 287Q1116 305 1114 312Q1087 314 1030.5 325Q974 336 953 342Q947 336 942 317Q937 298 937 284Z M1070 -383Q1154 -329 1197 -303.5Q1240 -278 1258 -278Q1255 -221 1245.5 -181.5Q1236 -142 1214 -91Q1188 -93 1176 -93Q1117 -93 1046 -68Q1019 -58 996 -49Q935 -25 887 -12.5Q839 0 776 0Q761 0 755 -22.5Q749 -45 749 -93Q749 -140 754.5 -163Q760 -186 776 -186Q830 -186 868.5 -193Q907 -200 970 -215L995 -221L1057 -235Q1019 -256 993 -266Q965 -277 933 -281.5Q901 -286 850 -289L828 -290L824 -294Q828 -332 839.5 -378.5Q851 -425 862 -447Q883 -450 901 -450Q938 -450 970 -438.5Q1002 -427 1035 -406ZM942 137Q945 124 957.5 101.5Q970 79 986 60.5Q1002 42 1014 40Q1025 38 1047.5 50Q1070 62 1089.5 79.5Q1109 97 1111 107Q1115 122 1088.5 159.5Q1062 197 1044 209Q1023 201 989 177.5Q955 154 942 137Z"
SHADDA = "M443 -555Q443 -581 448 -603H483Q484 -568 491 -554.5Q498 -541 511 -541Q531 -541 540 -561Q549 -581 554 -614L588 -607Q584 -554 608 -554Q619 -554 625 -567Q631 -580 632 -614H667L668 -598Q668 -554 653.5 -516.5Q639 -479 605 -479Q577 -479 565 -503H561Q541 -457 504 -457Q472 -457 457.5 -486Q443 -515 443 -555Z"
BOUNDS = (30, -614, 1258, 342)  # xmin, ymin, xmax, ymax of the word in glyph units
WORD_W = 50.0                    # word width inside the 108 canvas
OUTLINE = 6.0                    # outline thickness (canvas units)

THEMES = {
    "dark":  dict(bg="#000000", pat="#10161D", word="#38BDF8", line="#06263D", yellow="#FACC15"),
    "light": dict(bg="#FFFFFF", pat="#E3EAF1", word="#0EA5E9", line="#0B1F3A", yellow="#EAB308"),
}

def star(cx, cy, r, pat):
    h = r
    sq1 = f'<rect x="{cx-h}" y="{cy-h}" width="{2*h}" height="{2*h}" />'
    sq2 = f'<rect x="{cx-h}" y="{cy-h}" width="{2*h}" height="{2*h}" transform="rotate(45 {cx} {cy})" />'
    return sq1 + sq2

def bg_svg(t):
    c = THEMES[t]
    cell = 18
    parts = []
    for gy in range(-1, 8):
        for gx in range(-1, 8):
            cx = gx * cell + (cell / 2 if gy % 2 else 0)
            cy = gy * cell * 0.9
            parts.append(star(cx, cy, 5.2, c["pat"]))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">'
            f'<rect width="108" height="108" fill="{c["bg"]}"/>'
            f'<g fill="none" stroke="{c["pat"]}" stroke-width="0.7">{"".join(parts)}</g></svg>')

def fg_svg(t):
    c = THEMES[t]
    s = WORD_W / (BOUNDS[2] - BOUNDS[0])
    tx = 54 - s * (BOUNDS[0] + BOUNDS[2]) / 2
    ty = 54 - s * (BOUNDS[1] + BOUNDS[3]) / 2
    sw = OUTLINE / s
    g = (f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})">'
         f'<g fill="none" stroke="{c["line"]}" stroke-width="{sw:.1f}" stroke-linejoin="round" stroke-linecap="round">'
         f'<path d="{MAIN}"/><path d="{SHADDA}"/></g>'
         f'<path d="{MAIN}" fill="{c["word"]}"/>'
         f'<path d="{SHADDA}" fill="{c["yellow"]}"/></g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">{g}</svg>'

def legacy_svg(t):
    inner_bg = bg_svg(t).split('>', 1)[1].rsplit('</svg>', 1)[0]
    inner_fg = fg_svg(t).split('>', 1)[1].rsplit('</svg>', 1)[0]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 14 80 80" width="80" height="80">'
            f'<defs><clipPath id="m"><rect x="14" y="14" width="80" height="80" rx="16"/></clipPath></defs>'
            f'<g clip-path="url(#m)">{inner_bg}{inner_fg}</g></svg>')

def render(svg_text, out_png, size):
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_text); name = f.name
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", out_png, name], check=True)
    os.unlink(name)

ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

def main():
    res = sys.argv[1]
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    for t in THEMES:
        for d, px in ADAPTIVE.items():
            render(bg_svg(t), f"{res}/mipmap-{d}/gemma_{t}_bg.png", px)
            render(fg_svg(t), f"{res}/mipmap-{d}/gemma_{t}_fg.png", px)
        for d, px in LEGACY.items():
            render(legacy_svg(t), f"{res}/mipmap-{d}/gemma_{t}.png", px)
        os.makedirs(f"{res}/mipmap-anydpi-v26", exist_ok=True)
        with open(f"{res}/mipmap-anydpi-v26/gemma_{t}.xml", "w") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    f'  <background android:drawable="@mipmap/gemma_{t}_bg"/>\n'
                    f'  <foreground android:drawable="@mipmap/gemma_{t}_fg"/>\n'
                    '</adaptive-icon>\n')
        if prev:
            render(legacy_svg(t), f"{prev}/{t}_legacy.png", 256)
    print("icons ok")

if __name__ == "__main__":
    main()
