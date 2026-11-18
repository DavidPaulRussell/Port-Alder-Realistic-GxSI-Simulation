"""Everett loader director (EDHX-Script, runs every tick).

Builds Everett the way the original sequence does, then rebuilds it era by era
for 5,000 years. The console renders whatever this program writes:
  bld/<site>   design "era|style|h100|fw100|fd100|rgb|features|variant|wave"
  sim/env      "era|sea100|forest100|sky|glow100|traffic100"
  sim/clock    "tick|era|rebuilds|built|p1000|retired"
  sim/hud      "year|era|rebuilds|built"
  sim/spaceport  highest spaceport milestone reached (1 ground broken, 2 first launch,
               3 expansion, 4 space elevator), announced with emit("milestone", ...)
Everything is integer arithmetic plus sqrt, so every runtime gets the same city.
"""

T = tick()
seed = fact("seed")
target = fact("rebuild_target")
WAVES = 3

S = split(get("city/sites"), ";")
NS = len(S)
stages = split(fact("stages"), ",")
eras = split(fact("eras"), ",")
NE = len(eras)

ENV = ["0|0|55|0|0|60", "1|0|58|1|10|80", "2|0|50|2|20|100", "3|60|47|3|25|80",
       "4|60|44|4|40|100", "5|45|40|5|90|100", "6|30|96|6|45|40", "7|25|86|7|100|70"]


def hsh(a, b, c):
    h = (a * 7919 + b * 104729 + c * 1299709 + seed * 31 + 12345) % 2147483647
    h = (h * 48271) % 2147483647
    h = (h * 48271) % 2147483647
    return h / 2147483647


def pick(xs, k):
    n = len(xs)
    j = floor(k * n)
    if j > n - 1:
        j = n - 1
    return xs[j]


def site(i):
    return split(S[i], ",")


def stage_range(name):
    out = [0, 0]
    k = 0
    while k < len(stages):
        p = split(stages[k], ":")
        if p[0] == name:
            out = [float(p[1]), float(p[2])]
        k = k + 1
    return out


def mk(e, s, h, fw, fd, rgb, f, v, w):
    return (str(e) + "|" + str(s) + "|" + str(floor(h * 100)) + "|" + str(floor(fw * 100)) + "|" +
            str(floor(fd * 100)) + "|" + str(rgb) + "|" + str(f) + "|" + str(v) + "|" + str(w))


def core(ring):
    c = 1 - min(ring / 320, 1)
    return c * sqrt(c)


# ---------------------------------------------------------------- present day (2026)
def design0(i, zone, area, ring):
    k1 = hsh(i, 0, 1)
    k2 = hsh(i, 0, 2)
    v = floor(hsh(i, 0, 3) * 1000)
    if zone == 1:
        h = (1.6 + 7.2 * core(ring)) * (0.55 + 0.9 * k1)
        if area == 3:
            h = h * 1.35
        if h > 4.2:
            return mk(0, 1, h, 0.82, 0.82, pick([0x8FB8CC, 0x6E9DB5, 0xA9C7D6, 0x7FA7BD], k2), 128 * floor(k2 * 2), v, 0)
        if k2 < 0.5:
            return mk(0, 2, h, 0.9, 0.9, pick([0xA35A44, 0x8E4A39, 0xB86E52, 0x9C5B48], k1), 0, v, 0)
        return mk(0, 6, h, 0.88, 0.88, pick([0xD8D0BC, 0xCFC6B0, 0xE3DCCB], k1), 0, v, 0)
    if zone == 2:
        if ring < 420 and k1 < 0.22:
            return mk(0, 2, 1.3 + 0.9 * k2, 0.9, 0.85, pick([0xA35A44, 0xB86E52, 0xC9B79A], k2), 0, v, 0)
        return mk(0, 3, 0.62 + 0.16 * k2, 0.8, 0.72, pick([0xF2EEE6, 0xE8DCC2, 0xC9D8E6, 0xE9E1B8, 0xBFD3BF], k1), 0, v, 0)
    if zone == 3:
        if area == 9:
            return mk(0, 31, 3.0, 1.0, 1.0, 0x2F6FB8, 0, v, 0)
        if k1 < 0.62:
            return mk(0, 30, 1.0 + floor(k2 * 3), 0.9, 0.9, 0, 0, v, 0)
        return mk(0, 4, 1.1, 0.92, 0.88, pick([0xBFC3C7, 0xC9BFA8, 0x9FB0BF], k2), 0, v, 0)
    if zone == 4:
        if k1 < 0.4:
            return mk(0, 32, 1.3, 0.85, 0.85, 0xB9B2A3, 0, v, 0)
        if k1 < 0.65:
            return mk(0, 33, 1.0, 0.9, 0.9, 0xE4E6E8, 0, v, 0)
        return mk(0, 4, 1.2, 0.92, 0.9, pick([0xBFC3C7, 0xC9BFA8, 0x9FB0BF], k2), 0, v, 0)
    if zone == 5:
        if area == 8:
            return mk(0, 5, 2.4, 1.0, 1.0, 0xDDE1E5, 0, v, 0)
        if area == 7:
            return mk(0, 34, 0.9, 1.0, 1.0, 0xCFE3EE, 0, v, 0)
        return mk(0, 4, 0.9, 0.9, 0.9, 0xC7CDD3, 0, v, 0)
    return ""


# ---------------------------------------------------------------- the spaceport beside the airport
def spaceport(e, area, k1, k2, v, w):
    if e == 3:
        return mk(3, 40, 0.6, 1.0, 1.0, 0xC9CDD2, 0, v, w)
    f = 0
    if e >= 5:
        f = 4
    if e == 6:
        f = 1
    if area == 11:
        return mk(e, 41, 6.0 + e * 1.1, 1.0, 1.0, pick([0xC8423A, 0xB8392F], k1), f, v, w)
    if area == 13:
        return mk(e, 42, 1.8 + e * 0.25, 1.0, 1.0, pick([0xDDE3E8, 0xC8D6E5], k2), f, v, w)
    if area == 15 and e == 7:
        return mk(7, 44, 170, 1.0, 1.0, 0x41D9EC, 4, v, w)
    return mk(e, 43, 0.3, 1.0, 1.0, 0x2E3440, 4, v, w)


# ---------------------------------------------------------------- the future
def designE(i, e, w, zone, area, ring, low):
    k1 = hsh(i, e * 7 + w, 11)
    k2 = hsh(i, e * 7 + w, 12)
    k3 = hsh(i, e * 7 + w, 13)
    v = floor(k3 * 1000)
    if zone == 8:
        return spaceport(e, area, k1, k2, v, w)
    m = 0.75 + 0.2 * w
    dt = core(ring)
    big = zone == 1 or zone == 5
    if e == 1:
        if zone == 1:
            return mk(1, pick([7, 7, 1], k1), (2.2 + 9.0 * dt) * (0.6 + 0.9 * k2) * m, 0.8, 0.8,
                      pick([0xA9D2C9, 0x8FC1B5, 0x9EC4D6], k2), 1, v, w)
        if zone == 2:
            if k1 < 0.35:
                return mk(1, 8, 1.4 + 1.2 * k2 * m, 0.85, 0.8, pick([0xC69C6D, 0xB5895C, 0xD2B48C], k2), 1, v, w)
            return mk(1, 3, 0.66 + 0.15 * k2, 0.8, 0.72, pick([0xF4F1EA, 0xDDE8E2, 0xE8E0CC], k2), 16, v, w)
        if zone == 3:
            if area == 9:
                return mk(1, 31, 3.4, 1.0, 1.0, 0x2A9D8F, 4, v, w)
            return mk(1, pick([35, 30], k1), 1.3 + k2, 0.9, 0.9, 0xD7DEE4, 16, v, w)
        if zone == 6:
            return mk(1, 3, 0.7, 0.8, 0.72, 0xF4F1EA, 16, v, w)
        return mk(1, pick([9, 9, 4], k1), 1.0 + 0.4 * k2, 0.92, 0.9, pick([0x2B3F5C, 0xC9D3DC], k2), 16, v, w)
    if e == 2:
        if zone == 1:
            return mk(2, pick([10, 11, 10, 12], k1), (3.5 + 15.0 * dt) * (0.6 + 0.8 * k2) * m, 0.7, 0.7,
                      pick([0x9EC1E0, 0xC8D6E5, 0x8AA0B8, 0xB8D8D0], k2), 2 + 32 * floor(k3 * 2), v, w)
        if zone == 2 or zone == 6:
            if k1 < 0.45:
                return mk(2, 12, 2.2 + 3.0 * k2 * m, 0.7, 0.7, pick([0xD9E4E8, 0xCDD9CF], k2), 1, v, w)
            return mk(2, pick([13, 8], k2), 1.6 + 1.6 * k2 * m, 0.85, 0.85, pick([0xE2D3BC, 0xC69C6D], k1), 1, v, w)
        if zone == 3:
            return mk(2, pick([35, 14], k1), 1.8 + 1.4 * k2, 0.85, 0.85, 0xC8D6E5, 64, v, w)
        return mk(2, pick([11, 10, 9], k1), 2.0 + 4.0 * k2 * m, 0.75, 0.75, pick([0x8AA0B8, 0x9EC1E0], k2), 2, v, w)
    if e == 3:
        if zone == 7:
            return mk(3, 15, 1.0 + 1.6 * k2 * m, 0.9, 0.9, pick([0xE6EEF0, 0x6FB7B0, 0xBFE3E0], k1), 64, v, w)
        if low == 1 or zone == 3:
            return mk(3, 14, 1.6 + 2.2 * k2 * m, 0.85, 0.85, pick([0xE6EEF0, 0x6FB7B0], k1), 64, v, w)
        if zone == 1:
            return mk(3, pick([16, 10, 16], k1), (3.6 + 14.0 * dt) * (0.6 + 0.8 * k2) * m, 0.82, 0.82,
                      pick([0x6FB7B0, 0xE6EEF0, 0x9CC9C4], k2), 2, v, w)
        return mk(3, pick([12, 13, 16], k1), 1.8 + 3.2 * k2 * m, 0.78, 0.78, pick([0xE6EEF0, 0x9CC9C4], k2), 1, v, w)
    if e == 4:
        if zone == 7:
            return mk(4, pick([15, 18], k1), 1.4 + 1.8 * k2 * m, 0.95, 0.95, pick([0xF0EDE6, 0xE0C9A0], k2), 64 + 8, v, w)
        if zone == 1:
            return mk(4, pick([17, 19, 17], k1), (4.0 + 15.0 * dt) * (0.6 + 0.7 * k2) * m, 0.95, 0.95,
                      pick([0xE0C9A0, 0xD08F6A, 0xF0EDE6], k2), 1 + 8, v, w)
        if big:
            return mk(4, 22, 2.8 + 2.0 * k2, 0.95, 0.95, 0xF0EDE6, 4, v, w)
        return mk(4, pick([18, 18, 17, 19], k1), 1.6 + 2.6 * k2 * m, 0.92, 0.92,
                  pick([0xF0EDE6, 0xE0C9A0, 0xD08F6A], k2), 8 * floor(k3 * 2), v, w)
    if e == 5:
        if zone == 1:
            return mk(5, pick([20, 21, 20], k1), (5.0 + 19.0 * dt) * (0.6 + 0.8 * k2) * m, 0.66, 0.66,
                      pick([0x9BE7FF, 0xC9A7FF, 0x7FFFD4, 0xFFB7E3], k2), 4 + 32, v, w)
        if zone == 7:
            return mk(5, 22, 1.8 + 2.4 * k2 * m, 0.95, 0.95, pick([0x9BE7FF, 0xC9A7FF], k1), 4, v, w)
        return mk(5, pick([20, 22, 21, 20], k1), 2.0 + 4.5 * k2 * m, 0.7, 0.7,
                  pick([0x9BE7FF, 0xC9A7FF, 0x7FFFD4], k2), 4, v, w)
    if e == 6:
        if zone == 1:
            return mk(6, pick([23, 24, 23], k1), (3.0 + 11.0 * dt) * (0.7 + 0.6 * k2) * m, 0.9, 0.9,
                      pick([0x8C6E4E, 0xBFE8C8, 0x7A5C3E], k2), 1, v, w)
        if k1 < 0.55 and zone != 5:
            return mk(6, 0, 0, 1, 1, 0x5FA055, 0, v, w)
        return mk(6, pick([24, 23], k2), 1.4 + 2.4 * k2 * m, 0.9, 0.9, pick([0xBFE8C8, 0x8C6E4E], k1), 1, v, w)
    if zone == 1:
        return mk(7, pick([25, 26, 27, 25], k1), (5.0 + 20.0 * dt) * (0.6 + 0.8 * k2) * m, 0.6, 0.6,
                  pick([0x1E2A38, 0x41D9EC, 0xF7C75E, 0x23344A], k2), 4 + 8 * floor(k3 * 2), v, w)
    if zone == 7:
        return mk(7, 26, 2.2 + 3.0 * k2 * m, 0.9, 0.9, pick([0x41D9EC, 0xF7C75E], k1), 4 + 64, v, w)
    return mk(7, pick([27, 25, 26], k1), 1.8 + 4.5 * k2 * m, 0.7, 0.7, pick([0x1E2A38, 0x41D9EC, 0xF7C75E], k2), 4, v, w)


def build_zone(z, stage, f0, f1):
    raw = get("city/zone/" + str(z))
    if raw == None or raw == "":
        return 0
    r = stage_range(stage)
    a = r[0] + (r[1] - r[0]) * f0
    b = r[0] + (r[1] - r[0]) * f1
    if T < a or T >= b:
        return 0
    ids = split(raw, ",")
    n = len(ids)
    lo = floor(n * (T - a) / (b - a))
    hi = floor(n * (T + 1 - a) / (b - a))
    if T + 1 >= b:
        hi = n
    cnt = 0
    j = lo
    while j < hi and j < n:
        i = float(ids[j])
        sp = site(i)
        d = design0(i, float(sp[0]), float(sp[2]), float(sp[1]))
        if d != "":
            put("bld/" + str(i), d)
            emit("build", str(i) + "|0|" + split(d, "|")[1])
            cnt = cnt + 1
        j = j + 1
    return cnt


def active_total():
    tot = 0
    e = 1
    while e <= NE:
        j = 0
        while j < NS:
            if float(split(S[j], ",")[3]) <= e:
                tot = tot + 1
            j = j + 1
        e = e + 1
    return tot


# ---------------------------------------------------------------- tick
clk = get("sim/clock")
if clk == None:
    clk = "0|0|0|0|0|0"
c = split(clk, "|")
era = float(c[1])
rebuilds = float(c[2])
built = float(c[3])
p1000 = float(c[4])
retired = float(c[5])
spl = 0
spr = get("sim/spaceport")
if spr != None:
    spl = float(spr)

cur = 0
k = 0
while k < NE:
    if T >= float(split(eras[k], ":")[0]):
        cur = k + 1
    k = k + 1

if cur != era:
    era = cur
    put("sim/env", ENV[min(cur, len(ENV) - 1)])
    put("sim/era", str(cur))
    emit("era", str(cur))
    if cur >= 1 and p1000 == 0:
        p1000 = min(1000, floor(1000 * target / (WAVES * max(1, active_total()))))

if cur == 0:
    built = built + build_zone(1, "streets", 0.0, 0.78)
    built = built + build_zone(2, "streets", 0.25, 1.0)
    built = built + build_zone(3, "port", 0.0, 1.0)
    built = built + build_zone(4, "aviation", 0.0, 0.8)
    built = built + build_zone(5, "aviation", 0.15, 1.0)
else:
    p = split(eras[cur - 1], ":")
    s0 = float(p[0])
    s1 = float(p[1])
    wl = (s1 - s0) / WAVES
    rel = T - s0
    w = floor(rel / wl)
    if w > WAVES - 1:
        w = WAVES - 1
    f0 = (rel - w * wl) / wl
    f1 = (rel + 1 - w * wl) / wl
    lo = floor(NS * f0)
    hi = floor(NS * f1)
    if f1 >= 1 and f0 < 1:
        hi = NS
    prob = p1000 / 1000
    j = lo
    while j < hi and j < NS:
        i = j
        if cur == 6:
            i = NS - 1 - j
        sp = site(i)
        zone = float(sp[0])
        ok = float(sp[3]) <= cur and hsh(i, cur * 7 + w, 5) < prob
        if zone == 8:
            ok = float(sp[3]) <= cur and w == 0
        if ok:
            d = designE(i, cur, w, zone, float(sp[2]), float(sp[1]), float(sp[4]))
            put("bld/" + str(i), d)
            st = split(d, "|")[1]
            emit("rebuild", str(i) + "|" + str(cur) + "|" + st)
            if st == "0":
                retired = retired + 1
            else:
                rebuilds = rebuilds + 1
            if zone == 8:
                lvl = 0
                if cur == 3:
                    lvl = 1
                if cur == 4 and st == "41":
                    lvl = 2
                if cur == 5:
                    lvl = 3
                if cur == 7 and st == "44":
                    lvl = 4
                if lvl > spl:
                    spl = lvl
                    emit("milestone", "spaceport|" + str(lvl) + "|" + str(floor(metric("kf_year"))))
        j = j + 1

year = floor(metric("kf_year"))
put("sim/spaceport", str(spl))
put("sim/clock", str(T) + "|" + str(era) + "|" + str(rebuilds) + "|" + str(built) + "|" + str(p1000) + "|" + str(retired))
put("sim/hud", str(year) + "|" + str(era) + "|" + str(rebuilds) + "|" + str(built))
