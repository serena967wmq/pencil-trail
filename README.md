# Pencil Trail ✏️

A mouse-trail that draws like a soft graphite pencil held on its side — the kind of
dry, grainy, tapering stroke you get from a 6B pencil or Procreate's textured pencil brushes.

- The **cursor is the nib**: the sharp, dark edge sits right on the pointer.
- It **feathers to one side** into faint paper-tooth grain (asymmetric, like a real side-of-pencil stroke).
- **Velocity-aware** width, with a **head-dark → tail-light** fade ("摆尾渐变").
- Drawn as **one continuous pass** so there are no beads, legs, or tadpole artefacts.
- Stays smooth on **fast strokes** (uses `getCoalescedEvents()` + Catmull-Rom + streamline).

## Files

| File | What it is |
|------|------------|
| `pencil-trail.html` | **Standalone.** Double-click to open in any browser. No server needed. Everything is in one file. |
| `pencil-trail.js` | **Importable ES module** (`PencilTrail` class). For dropping into your own site. |
| `index.html` | Minimal demo that imports the module. *(Must be served over http, e.g. GitHub Pages — ES modules don't load from `file://`.)* |

## Quick start

**Just want to see it / use it as-is:** open `pencil-trail.html`.

**Add it to your own page:**

```html
<script type="module">
  import { PencilTrail } from './pencil-trail.js';
  new PencilTrail();              // attaches a full-window overlay
</script>
```

To remove it later: keep the instance and call `.destroy()`:

```js
const trail = new PencilTrail();
// ...
trail.destroy();
```

## Options

Pass an object to override any default:

```js
new PencilTrail({
  decay:       0.018,  // trail life lost per frame; smaller = longer trail
  widthMin:    3.5,    // half-width at the tail (px)
  widthMax:    10.5,   // extra half-width toward the head (px)
  darkMin:     0.16,   // ink strength at the tail
  darkMax:     0.50,   // ink strength at the head (keep < ~0.6 so it stays airy)
  grainPerPx:  1.8,    // tooth density
  featherSign: 1,      // +1 / -1 : which side the grain feathers toward
  inkBase:     20,     // base grey of specks (0 = black)
  streamline:  0.28,   // input smoothing 0..1, lower = rounder (more lag)
  background:  null,   // CSS colour behind the trail; null = transparent overlay
  showNib:     true,   // draw the dot at the cursor
});
```

## Notes

- Best on a light background (it's graphite on paper). The demo uses `#fcfbf8`.
- It's a pointer-events-free overlay, so it won't block clicks on the page beneath it.
- Mouse input has no real pressure or tilt, so width/darkness are derived from speed.

---

Built iteratively as a custom cursor effect for an art portfolio site.
