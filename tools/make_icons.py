"""Generuje ikony aplikacji (PNG) bez zewnętrznych bibliotek."""
import struct, zlib, sys

def png(size, path):
    bg = (10, 125, 90)
    fg = (255, 255, 255)
    s = size / 180
    # słupki rosnącego wykresu: (x, szerokość, wysokość) w skali 180 px
    bars = [(38, 24, 44), (78, 24, 72), (118, 24, 104)]
    base = 136
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            c = bg
            for bx, bw, bh in bars:
                if bx * s <= x < (bx + bw) * s and (base - bh) * s <= y < base * s:
                    c = fg
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(data)

for n in (180, 192, 512):
    png(n, f'icon-{n}.png')
