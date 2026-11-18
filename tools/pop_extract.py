#!/usr/bin/env python3
"""Cut small tables out of a WorldPop population GeoTIFF for Port Alder. The TIFF itself never enters the repository.

    python pop_extract.py "D:\\tickerinfo\\MAI_Pop_Datab\\United States of America.tif" "C:\\Users\\you\\Desktop\\Project12k\\port_alder_pop"

It writes three small files into the output folder, each with a .json beside it that says what it is:

    everett_pop_3arcsec.f32   the Everett area at the raster's own resolution (about 93 m by 62 m): where people live
    wa_pop_36arcsec.f32       Washington at 12 x 12 pixels (about 1.1 km by 0.75 km)
    us_pop_0p1deg.f32         the whole raster at 120 x 120 pixels (0.1 degree), for the movement matrix between regions

The first two take a minute or two. The third reads the whole file: a few minutes with numpy, GDAL or rasterio
installed, and up to an hour or two in plain Python (it prints its progress and can be stopped with Ctrl-C at any
time; the first two files are already written by then). Add --no-nation to skip it.

Needs only Python 3.9 or newer. numpy is used when it is installed (much faster); nothing is downloaded and nothing
is written outside the output folder. The reader handles what WorldPop's R2025A files are: BigTIFF or TIFF, tiled or
in strips, one band, LZW, Deflate or no compression, with or without a horizontal predictor.

The data: WorldPop (www.worldpop.org), population counts 2026, R2025A v1, 3 arc-second constrained, CC BY 4.0.
SPDX-License-Identifier: GPL-3.0-only
"""
import json
import os
import struct
import sys
import time
import zlib

try:
    import numpy as np
except Exception:  # numpy is optional
    np = None

EVERETT = (47.845, 48.034, -122.325, -122.043)            # south, north, west, east: the area the city view covers
WASHINGTON = (45.50, 49.05, -124.90, -116.90)

TYPES = {1: ("B", 1), 2: ("c", 1), 3: ("H", 2), 4: ("I", 4), 5: ("II", 8), 6: ("b", 1), 7: ("B", 1), 8: ("h", 2),
         9: ("i", 4), 10: ("ii", 8), 11: ("f", 4), 12: ("d", 8), 16: ("Q", 8), 17: ("q", 8), 18: ("Q", 8)}


class Tiff:
    """The first image of a TIFF or BigTIFF: its layout, and its tiles (or strips) decoded on request."""

    def __init__(self, path):
        self.f = open(path, "rb")
        head = self.f.read(16)
        if head[:2] not in (b"II", b"MM"):
            raise SystemExit("not a TIFF file: " + path)
        self.bo = "<" if head[:2] == b"II" else ">"
        magic = struct.unpack(self.bo + "H", head[2:4])[0]
        if magic not in (42, 43):
            raise SystemExit("not a TIFF file: " + path)
        self.big = magic == 43
        off = struct.unpack(self.bo + ("Q" if self.big else "I"), head[8:16] if self.big else head[4:8])[0]
        self.tags = self._ifd(off)
        t = self.tags
        self.width, self.height = t[256][0], t[257][0]
        self.bits = t.get(258, [1])[0]
        self.comp = t.get(259, [1])[0]
        self.pred = t.get(317, [1])[0]
        self.fmt = t.get(339, [1])[0]                      # 1 unsigned, 2 signed, 3 float
        if t.get(277, [1])[0] != 1:
            raise SystemExit("expected one band")
        if 322 in t:
            self.tw, self.th = t[322][0], t[323][0]
            self.offsets, self.counts = t[324], t[325]
        else:                                              # strips are tiles as wide as the image
            self.tw, self.th = self.width, t.get(278, [self.height])[0]
            self.offsets, self.counts = t[273], t[279]
        self.across = (self.width + self.tw - 1) // self.tw
        self.down = (self.height + self.th - 1) // self.th
        scale, tie = t.get(33550), t.get(33922)
        if not scale or not tie:
            raise SystemExit("the file has no georeference (ModelPixelScale / ModelTiepoint)")
        self.dx, self.dy = scale[0], scale[1]
        self.lon0, self.lat0 = tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1]     # the top-left corner
        nd = t.get(42113)
        try:
            self.nodata = float(nd) if nd is not None else None
        except ValueError:
            self.nodata = None
        code = {(32, 3): "f", (64, 3): "d", (16, 1): "H", (16, 2): "h", (32, 1): "I", (32, 2): "i", (8, 1): "B"}.get((self.bits, self.fmt))
        if code is None:
            raise SystemExit(f"unsupported samples: {self.bits} bits, format {self.fmt}")
        self.code, self.size = code, self.bits // 8
        self.name = t.get(269) or t.get(270) or ""

    def _ifd(self, off):
        f, bo = self.f, self.bo
        f.seek(off)
        if self.big:
            n, esz = struct.unpack(bo + "Q", f.read(8))[0], 20
        else:
            n, esz = struct.unpack(bo + "H", f.read(2))[0], 12
        raw, tags = f.read(n * esz), {}
        for i in range(n):
            e = raw[i * esz:(i + 1) * esz]
            tag, typ = struct.unpack(bo + "HH", e[:4])
            count = struct.unpack(bo + ("Q" if self.big else "I"), e[4:12] if self.big else e[4:8])[0]
            val = e[12:20] if self.big else e[8:12]
            fmt, size = TYPES.get(typ, ("B", 1))
            total = size * count
            if total > len(val):
                f.seek(struct.unpack(bo + ("Q" if self.big else "I"), val)[0])
                data = f.read(total)
            else:
                data = val[:total]
            if typ == 2:
                tags[tag] = data.split(b"\0")[0].decode("latin1")
            elif typ in (5, 10):
                v = struct.unpack(bo + fmt[0] * (2 * count), data)
                tags[tag] = [v[k] / v[k + 1] if v[k + 1] else 0 for k in range(0, len(v), 2)]
            else:
                tags[tag] = list(struct.unpack(bo + fmt * count, data))
        return tags

    def empty(self, k):
        """A tile so small on disk that it can hold no people (one value repeated)."""
        return self.counts[k] == 0 or (self.comp != 1 and self.counts[k] < 1200)

    def tile(self, k):
        """Tile k as rows of values: a numpy array (th, tw) when numpy is here, else a list of array.array rows."""
        import array
        if self.counts[k] == 0:
            return None
        self.f.seek(self.offsets[k])
        raw = self.f.read(self.counts[k])
        if self.comp == 5:
            raw = lzw(raw)
        elif self.comp in (8, 32946):
            raw = zlib.decompress(raw)
        elif self.comp != 1:
            raise SystemExit(f"unsupported compression {self.comp}")
        need = self.tw * self.th * self.size
        if len(raw) < need:
            raw = raw + b"\0" * (need - len(raw))
        if np is not None:
            a = np.frombuffer(raw[:need], dtype=np.dtype(self.bo + {1: "u1", 2: "u2", 4: "u4", 8: "u8"}[self.size])).reshape(self.th, self.tw)
            if self.pred == 2:
                a = np.cumsum(a, axis=1, dtype=a.dtype)                     # horizontal differencing, modulo the word
            elif self.pred == 3:
                raise SystemExit("floating-point predictor (3) is not supported")
            return a.view(np.dtype(self.bo + self.code)) if self.code in "fd" else a.astype(np.dtype(self.bo + self.code))
        rows, word, mask = [], {1: "B", 2: "H", 4: "I", 8: "Q"}[self.size], (1 << (8 * self.size)) - 1
        swap = (sys.byteorder == "little") != (self.bo == "<")
        for r in range(self.th):
            b = raw[r * self.tw * self.size:(r + 1) * self.tw * self.size]
            a = array.array(word, b)
            if swap:
                a.byteswap()
            if self.pred == 2:
                acc, out = 0, array.array(word, bytes(len(b)))
                for i, v in enumerate(a):
                    acc = (acc + v) & mask
                    out[i] = acc
                a = out
            elif self.pred == 3:
                raise SystemExit("floating-point predictor (3) is not supported")
            rows.append(array.array(self.code, a.tobytes()) if self.code != word else a)
        return rows


def lzw(data):
    """TIFF's LZW: codes most significant bit first, 9 to 12 bits, the width growing one code early."""
    out, append = [], None
    table = [bytes((i,)) for i in range(256)] + [b"", b""]
    out_append = out.append
    bits = nbits = 0
    width, mask, nxt, prev = 9, 511, 258, None
    for byte in data:
        bits = (bits << 8) | byte
        nbits += 8
        if nbits < width:
            continue
        nbits -= width
        code = (bits >> nbits) & mask
        bits &= (1 << nbits) - 1
        if code == 256:
            del table[258:]
            width, mask, nxt, prev = 9, 511, 258, None
            continue
        if code == 257:
            break
        if prev is None:
            s = table[code]
        elif code < nxt:
            s = table[code]
            table.append(prev + s[:1])
            nxt += 1
        else:
            s = prev + prev[:1]
            table.append(s)
            nxt += 1
        out_append(s)
        prev = s
        if nxt + 1 >= (1 << width) and width < 12:
            width += 1
            mask = (1 << width) - 1
    return b"".join(out)


def window(t, south, north, west, east, step, label, out_dir, name, what):
    """Sum the people in blocks of step x step pixels over a latitude and longitude box; write float32 rows, north first."""
    c0 = max(0, int((west - t.lon0) / t.dx)) // step * step
    c1 = min(t.width, int((east - t.lon0) / t.dx) + 1)
    r0 = max(0, int((t.lat0 - north) / t.dy)) // step * step
    r1 = min(t.height, int((t.lat0 - south) / t.dy) + 1)
    if c1 <= c0 or r1 <= r0:
        print(f"  {label}: outside this raster, skipped")
        return
    cols, rows = (c1 - c0 + step - 1) // step, (r1 - r0 + step - 1) // step
    grid = [0.0] * (cols * rows) if np is None else np.zeros((rows, cols), dtype=np.float64)
    tiles = [(ty, tx) for ty in range(r0 // t.th, (r1 - 1) // t.th + 1) for tx in range(c0 // t.tw, (c1 - 1) // t.tw + 1)]
    started, done, total = time.time(), 0, 0.0
    for n, (ty, tx) in enumerate(tiles):
        k = ty * t.across + tx
        if not t.empty(k):
            a = t.tile(k)
            x0, y0 = tx * t.tw, ty * t.th
            xa, xb, ya, yb = max(c0, x0), min(c1, x0 + t.tw, t.width), max(r0, y0), min(r1, y0 + t.th, t.height)
            if np is not None:
                part = a[ya - y0:yb - y0, xa - x0:xb - x0].astype(np.float64)
                part[~(part > 0)] = 0.0                                     # no-data (and not-a-number) cells hold no one
                if t.nodata is not None and t.nodata > 0:
                    part[part == t.nodata] = 0.0
                gy = (np.arange(ya, yb) - r0) // step
                gx = (np.arange(xa, xb) - c0) // step
                np.add.at(grid, (gy[:, None], gx[None, :]), part)
            else:
                nd = t.nodata
                for y in range(ya, yb):
                    row, base = a[y - y0], ((y - r0) // step) * cols
                    for x in range(xa, xb):
                        v = row[x - x0]
                        if v > 0 and v != nd and v == v:
                            grid[base + (x - c0) // step] += v
            done += 1
        if (n + 1) % 25 == 0 or n + 1 == len(tiles):
            el = time.time() - started
            eta = el / (n + 1) * (len(tiles) - n - 1)
            print(f"  {label}: tile {n + 1} of {len(tiles)} ({done} with people), {el / 60:.1f} min so far, about {eta / 60:.1f} min left", flush=True)
    flat = grid.astype("<f4").tobytes() if np is not None else struct.pack("<%df" % len(grid), *grid)
    total = float(grid.sum()) if np is not None else sum(grid)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, name + ".f32"), "wb") as f:
        f.write(flat)
    meta = {"what": what, "source": t.name, "source_credit": "WorldPop (www.worldpop.org), R2025A v1, CC BY 4.0",
            "rows": rows, "cols": cols, "north": t.lat0 - r0 * t.dy, "west": t.lon0 + c0 * t.dx,
            "cell_degrees_lat": t.dy * step, "cell_degrees_lon": t.dx * step, "pixels_per_cell": step,
            "order": "float32 little-endian, row by row from the north-west corner", "people": round(total)}
    with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    print(f"  {label}: wrote {name}.f32 ({rows} x {cols} cells, {round(total):,} people)")


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        raise SystemExit(__doc__)
    t = Tiff(args[0])
    print(f"{args[0]}\n  {t.name or 'population raster'}: {t.width} x {t.height} pixels of {t.dx * 3600:.2f} arc-seconds, tiles {t.tw} x {t.th}, "
          f"compression {t.comp}, predictor {t.pred}, {'numpy' if np is not None else 'plain Python (numpy not installed: slower)'}")
    window(t, *EVERETT, 1, "Everett area", args[1], "everett_pop_3arcsec", "people per raster pixel in the Everett area")
    window(t, *WASHINGTON, 12, "Washington", args[1], "wa_pop_36arcsec", "people per 36 arc-second cell in Washington")
    if "--no-nation" not in argv:
        north, south = t.lat0, t.lat0 - t.height * t.dy
        window(t, south, north, t.lon0, t.lon0 + t.width * t.dx, 120, "whole raster", args[1], "us_pop_0p1deg", "people per 0.1 degree cell over the whole raster")
    print("done")


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except KeyboardInterrupt:
        print("\nstopped; the files already written are complete")
