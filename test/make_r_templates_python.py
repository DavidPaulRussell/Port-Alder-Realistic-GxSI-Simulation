"""Write the R0/R1/R2 .russl programs and their canonical IR using the RUSSL reference tooling."""
import json, sys, hashlib
sys.path.insert(0, sys.argv[1])            # path to corpus/tooling
import russl_reference as rr
MSSL_DIR = sys.argv[2]
mssl = {m: open(f"{MSSL_DIR}/{m}.mssl", "rb").read() for m in ("master_coupled_mechanics", "final_admission")}
dig = {m: hashlib.sha256(b).hexdigest() for m, b in mssl.items()}
STAGES = [
    ("plume.r0", "Seeded input frame", None),
    ("plume.r1", "Output of ByteFoundry 1 (2-adic XPU, Z/2^20)", "bytefoundry.bf1.plume2"),
    ("plume.r2", "Output of ByteFoundry 2 (5-adic XPU, Z/5^8)", "bytefoundry.bf2.plume5"),
]
def source(uid, title, producer):
    rows = [
        "F001│field│FD│field.frame│_│_│shape=1,1,8,128,128;sample=u32;axes=c4,c5,c6,c7,c8│_",
        "P001│field│FP│field.frame.candidate│F001│field.frame›source.state│mapping=identity5│eff=derive",
        "Y001│field│PY│field.pyramid│P001│field.frame.candidate│levels=20;downsample=mod2pow;spatial_axes=none│eff=derive",
    ]
    levels = [f"L{j:03d}│field│FS│field.level{j:02d}│Y001│field.pyramid│selector=mod2pow:{j}│eff=derive" for j in range(1, 21)]
    tail = [
        "C001│mechanics│CD│coupling.moore│Y001│field.pyramid│neighborhood=moore2;radius=1;representation=lane-rotated│eff=derive",
        "M001│mechanics│ME│mechanics.result│C001│master›field.pyramid│mode=deterministic;coupling=coupling.moore│eff=derive",
        "A001│admission│AE│admission.result│M001│admission›mechanics.result│policy=baseline│eff=derive",
        "E001│evidence│ER│receipt│A001│admission.result│content_bound=true│eff=write:evidence",
    ]
    head = ["RUSSL/1.0",
            f"# {title}." + (f" Produced by {producer}." if producer else ""),
            "# Field: 8 Byte20 lanes (c6) x 128 rows (c7) x 128 columns (c8), u32 words holding 20 bits.",
            "# Layers: a 20-level 2-adic pyramid; level j is the field reduced mod 2^j.",
            f"@unit id={uid} version=1.0.0 profile=russl.core target=russ fail=closed",
            "@defaults mode=deterministic regime=exact effect=read scope=self",
            f"@mssl alias=master module=master_coupled_mechanics source_version=0.1 digest=sha256:{dig['master_coupled_mechanics']}",
            f"@mssl alias=admission module=final_admission source_version=0.1 digest=sha256:{dig['final_admission']}",
            f"@frame id=F0000 parent=ROOT module={uid} phase=construct-evaluate",
            "ID│LANE│OP│OUT│CTRL│IN│ARG│META", *rows[:3], "@end",
            f"@frame id=F0001 parent=F0000 module={uid}.pyramid phase=pyramid",
            "ID│LANE│OP│OUT│CTRL│IN│ARG│META", *levels, "@end",
            f"@frame id=F0002 parent=F0001 module={uid}.evaluate phase=evaluate-admit",
            "ID│LANE│OP│OUT│CTRL│IN│ARG│META", *tail, "@end"]
    return rr.canonical_source("\n".join(head))
out = {"mssl": {m: b.decode() for m, b in mssl.items()}, "stages": []}
for uid, title, producer in STAGES:
    src = source(uid, title, producer)
    ir = rr.lower_russl(src)
    out["stages"].append({"unit": uid, "title": title, "producer": producer, "source": src,
                          "ir": rr.canonical_json_bytes(ir).decode(), "ir_id": ir["ir_id"]})
    print(uid, ir["ir_id"], len(ir["program"]), "rows")
json.dump(out, open("web/r-templates.json", "w"), ensure_ascii=False)
