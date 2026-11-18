# Everett loader cartridge kit

The loading sequence is an EDHX/1 container, `everett_loader.edhx`. It is played by
`plume-xpu-mini.html`, a cut-down Plume XPU console. The console verifies the container, runs its
`director` program on a port of edhx-vm/1, and draws the city the program writes. There is no video file.

## What runs where

| Piece | Lives in | Does |
|---|---|---|
| `director.py` (EDHX-Script) | the cartridge (program + `src/director.py` record) | Builds Everett as in the original sequence, then rebuilds it era by era from 2026 to 7026. That comes to 5,003 rebuilds and includes Paine Spaceport beside the airport. |
| `loader/config` record | the cartridge | UI text: phase labels and steps, era names and taglines, tips, milestones, welcome. |
| facts and `kf_year` keyframes | the cartridge | Timeline: 1,000 ticks, stage and era boundaries, seed, rebuild target. |
| `city/sites`, `city/zone/*` | the cartridge | Site survey made by `worldgen.js` for the seed. The console regenerates the same survey and checks that it matches. |
| WebGL terrain, buildings, life | the console | Draws `bld/<site>`, `sim/env` and the director's emits. |

The cartridge runs unchanged in your EDHX 1.0.0 runtime:

```sh
python edhx.py verify everett_loader.edhx
python edhx.py run everett_loader.edhx --ticks 1000      # on a copy: run commits to the file
python edhx.py get everett_loader.edhx sim/hud            # 7026|7|5003|252
```

A 1,000-tick run in that runtime and the console's JS runtime agree on every tick: same steps,
emissions, puts and effect sizes.

## Spaceport milestones (director emits `milestone`)

| Tick | Year | Event |
|---|---|---|
| 507 | 2542 | Ground broken for Paine Spaceport (pads poured beside the airfield) |
| 605 | 3152 | First orbital launch; rockets cycle on every pad from here on |
| 697 | 4012 | Expansion: three pads and two landing rings, lit at night |
| 889 | 6330 | Space elevator tether rises from the spaceport |

## Change the sequence

1. Edit `director.py`, `loader_config.json`, or the stage, era and target values in `make_cartridge.py`.
2. Rebuild the survey and the cartridge with your EDHX runtime:

```sh
node survey.js 1893 survey.json
python3 -I make_cartridge.py <path-to>/EDHX_Entangled_Data_Hologram_1.0.0 everett_loader.edhx survey.json loader_config.json director.py
```

3. Load the new cartridge in the console with **Controls → Cartridge**, or pass it in:
   `PlumeMini.create({ cartridge: bytesOrBase64OrUrl })`.

Text-only changes don't need a rebuild: `PlumeMini.create({ config: { place: 'Tacoma, WA', tips: [...] } })`
overrides the `loader/config` record.

## Wire it to your simulation's real load

```js
const loader = PlumeMini.create({ progressSource: 'external', chrome: 'screen' });
loader.setProgress(0.42);            // 0..1 of your load (or 0..100)
loader.setPhase('streets', 0.5);     // or report by phase id (loader.phases)
loader.complete();                   // fast-forwards the remaining ticks, then the welcome
loader.fail(err);                    // error state with Retry and Copy details
loader.on('enter', startSimulation); // also 'ready', 'phase', 'milestone', 'error', 'retry'
```

From a parent page or webview: `postMessage({ type: 'simloader:progress', value: 0.42 })`, and likewise
`simloader:phase {id, fraction}`, `simloader:complete`, `simloader:error {message}`.

Behaviour you get for free:

- **The bar keeps moving between your reports.** It creeps a little, but never past your number by more than 3%.
- **It never shows 100% before `complete()`.**
- **"Still working" notice.** Shown after `stallAfter` seconds (default 20) without a report.
- **"Taking longer than usual" notice.** Shown when the load runs past `expectedDuration` (default 240 s).
- **`complete()` fast-forwards.** The director runs every remaining tick before the welcome appears.

## One runtime note

A fresh EDHX 1.0.0 container stores `scale_floor: 0.0` in its gate state (`mind.py`). That value
overrides the policy's `z_scale_floor` of 4096. After any run of identical effect sizes, a one-byte
change then counts as anomalous (robust z = infinity), so a director's writes get withheld.
`make_cartridge.py` writes the policy value into the gate state. You may want the same fix in
`new_mind()`.
