"""生成 src-tauri/icons/icon.ico：蓝色圆角方块 + 白色 ¥（与界面主题色同款）。

多尺寸帧（16/24/32/48/64 为 BMP，128/256 为 PNG），保证标题栏/任务栏小尺寸清晰。
不依赖 Pillow：4x 超采样绘制后降采样抗锯齿，字节按 ICO/PNG 规范手工打包
（ICONDIRENTRY 的 reserved 必须为 0，GetHicon 生成的文件该项不合规）。
"""

import struct
import zlib

BLUE = (37, 99, 235)  # 与 ui/style.css 的 --accent (#2563eb) 一致
WHITE = (255, 255, 255)
SIZES = (16, 24, 32, 48, 64, 128, 256)
PNG_SIZES = {128, 256}
SS = 4  # 超采样倍数

# ¥ 字形笔画（256 设计稿坐标）：两斜、一竖、两横
STROKES_256 = [
    (76, 56, 128, 138),
    (180, 56, 128, 138),
    (128, 120, 128, 200),
    (80, 160, 176, 160),
    (80, 184, 176, 184),
]
RADIUS_256 = 52
THICK_256 = 16


def dist2_seg(px, py, x0, y0, x1, y1):
    vx, vy = x1 - x0, y1 - y0
    wx, wy = px - x0, py - y0
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = px - (x0 + t * vx), py - (y0 + t * vy)
    return dx * dx + dy * dy


def pixel_rgba(x, y, size):
    """目标像素 (x, y) 的 (r, g, b, a)：a=圆角方块覆盖率，颜色按笔画覆盖率在蓝/白间过渡。"""
    S = size * SS
    scale = S / 256.0
    radius = RADIUS_256 * scale
    half2 = (THICK_256 * scale / 2) ** 2
    strokes = [(x0 * scale, y0 * scale, x1 * scale, y1 * scale) for x0, y0, x1, y1 in STROKES_256]

    rect_hits = stroke_hits = 0
    for sy in range(y * SS, (y + 1) * SS):
        for sx in range(x * SS, (x + 1) * SS):
            # 圆角方块（蓝色底）判定
            if radius <= sx <= S - radius or radius <= sy <= S - radius:
                in_rect = True
            else:
                cx = min(max(sx, radius), S - radius)
                cy = min(max(sy, radius), S - radius)
                in_rect = (sx - cx) ** 2 + (sy - cy) ** 2 <= radius ** 2
            if not in_rect:
                continue
            rect_hits += 1
            for (x0, y0, x1, y1) in strokes:
                if dist2_seg(sx, sy, x0, y0, x1, y1) <= half2:
                    stroke_hits += 1
                    break

    if rect_hits == 0:
        return (*BLUE, 0)
    r = BLUE[0] + (WHITE[0] - BLUE[0]) * stroke_hits / rect_hits
    g = BLUE[1] + (WHITE[1] - BLUE[1]) * stroke_hits / rect_hits
    b = BLUE[2] + (WHITE[2] - BLUE[2]) * stroke_hits / rect_hits
    return (round(r), round(g), round(b), round(rect_hits / (SS * SS) * 255))


def render(size):
    return [[pixel_rgba(x, y, size) for x in range(size)] for y in range(size)]


def bmp_frame(pix):
    """32bpp BITMAPINFOHEADER + XOR(BGRA 自下而上) + AND 掩码（全 0，透明交给 alpha）。"""
    size = len(pix)
    xor = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            r, g, b, a = pix[y][x]
            xor += bytes((b, g, r, a))
    and_row = (size + 31) // 32 * 4
    and_mask = bytes(and_row * size)
    hdr = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                      len(xor) + len(and_mask), 0, 0, 0, 0)
    return hdr + bytes(xor) + and_mask


def png_frame(pix):
    size = len(pix)
    raw = bytearray()
    for row in pix:
        raw.append(0)  # filter: none
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


def main():
    frames = []
    for size in SIZES:
        pix = render(size)
        data = png_frame(pix) if size in PNG_SIZES else bmp_frame(pix)
        frames.append((size, data))
        print(f"  {size}x{size} frame: {len(data)} bytes")

    ico = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    for size, data in frames:
        wh = 0 if size >= 256 else size  # 256 按 ICO 规范写 0
        ico += struct.pack("<BBBBHHII", wh, wh, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    for _, data in frames:
        ico += data

    out = "src-tauri/icons/icon.ico"
    with open(out, "wb") as f:
        f.write(ico)
    print(f"created {out} ({len(ico)} bytes, {len(frames)} frames)")


if __name__ == "__main__":
    main()
