# Authored models

Code-drawn assets (`art/packs/`) give a clean, stylised look. Getting close to *Black Desert* or
*Expedition 33* takes sculpted, hand-textured models, and this folder is where they go. The app
loads them through `art/models.js`, lights them with `art/look.js` (image-based light and bloom)
and falls back to the code-drawn asset if a file is missing or fails to load.

## Where models come from

| route | quality | cost | notes |
|---|---|---|---|
| Commission (ArtStation, Fiverr, a 3D artist) | highest, made for the app | £££ | ask for the specs below in the brief |
| Buy (Sketchfab Store, Fab, CGTrader) | high | ££ | check the licence allows use in a published app |
| AI generation (Meshy, Tripo, Rodin) | good, fast | £ | generate, then rig and animate (the tool's own rigging or Mixamo) |
| Free (Sketchfab CC0 or CC-BY, Quaternius, Kenney) | varies | free | CC-BY needs credit; Quaternius and Kenney are stylised |

**Licences matter.** A `.glb` in this repo is served publicly, so anyone can download it. Use only
models whose licence allows that (CC0, CC-BY with credit, or a store licence that covers apps).
Every model is registered with its `credit` and `licence`.

## Specs for a phone

The app runs in a phone browser, so detail is spent where it shows:

| kind | triangles | textures | on screen |
|---|---|---|---|
| `hero` (raid boss, the Hunter) | ≤ 60,000 | ≤ 4 maps at 2K | one |
| `character` (shadow soldiers) | ≤ 25,000 | ≤ 4 maps at 1K–2K | a few |
| `prop` (relics, gym gear) | ≤ 12,000 | ≤ 4 maps at 1K | a few |

- **Format:** `.glb`, PBR metal/roughness (base colour, normal, ORM, emissive).
- **Orientation:** Y up, facing +Z, in metres. If it faces away, register it with `turn: 180`.
- **Rig and clips:** characters rigged, with clips named `Idle`, `Roar`, `Attack`, `Hit`, `Death` (map
  other names with `clips: { idle: 'Breathing Idle' }`).
- **Glow:** paint eyes, runes and cores into the emissive map. Bloom picks them up and leaves the body alone.
- **Compress** before adding (a one-off command on your machine, not a build step):
  `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress ktx2 --texture-size 2048`
  Draco, Meshopt and KTX2 all load.

## Adding one

1. Open `/art/catalogue.html` (run `python -m http.server 8000` at the repo root) and drop the `.glb`
   on the page. It previews in the realistic look with its triangle and texture checks. Fix anything
   it flags.
2. Put the file in `art/models/` and register it in `art/models/index.js`:
   ```js
   defineModel('antares', {
     url: './models/antares.glb', height: 6.8, category: 'hero', sector: 'dungeon', tiles: [3, 3],
     replaces: 'raid-boss', clips: { idle: 'Idle' }, credit: 'Artist, link', licence: 'CC-BY 4.0',
   });
   ```
3. `replaces` swaps it into the app wherever that asset shows. Today that means:

| `replaces` | where it shows | height to use |
|---|---|---|
| `raid-boss` | raid cinematics | ~6.8 |
| `relic-sword`, `relic-chestplate`, `relic-boots`, `relic-ring` | loot reveal | ~0.9 |

New places (the Hunter, a 3D shadow army) get a code-drawn stand-in and an id first, then take a
model the same way.

## Models built here

`monarch.glb` (the raid boss) is built in Blender from `models/src/monarch/build.py`: a skin-modifier
body unioned with muscle masses and voxel-remeshed, armour plates extracted from that surface,
procedural materials baked to one 2K set (colour, normal, ORM) plus a 1K glow map, a 17-bone rig and
the Idle and Roar clips. To change it, edit the script and rebuild (about two minutes on a laptop CPU):

```bash
python3.11 -m pip install "bpy==4.5.*"
cd art/models/src/monarch && python3.11 build.py --bake --out ../../monarch.glb
```

A model an artist sculpts by hand will beat it; when one arrives, register it with
`replaces: 'raid-boss'` and remove the Monarch's entry.

`hunter-male.glb` and `hunter-female.glb` (the player's own body, `art/hunter.js`) are built in
Blender from `models/src/hunter/build.py` on the MakeHuman base mesh and targets, which are CC0
(MakeHuman 1.x assets licence, section C; no credit required, credited here anyway). The body carries
73 morphs: training (`dev.*`), build, height, tape measurements, heritage and face. Eyes, brows,
a street outfit (`outfit.py`), training kit and ten hair styles ride on it by `_src` and carry no morphs of their own. Hair is a signed
distance field meshed with marching cubes (`hair.py`). To rebuild (about 30 seconds per body):

```bash
python3.11 -m pip install "bpy==4.5.*" scikit-image
cd art/models/src/hunter && python3.11 fetch.py && python3.11 build.py
```
