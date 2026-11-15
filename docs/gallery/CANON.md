# LEO CANON

## 1 Idea
A real, sunlit place you can play: the gallery re-hangs itself behind your back, and 8-bit mischief hides in corners.

## 2 Type
OFL `@fontsource` woff2, latin-ext (ã ç õ); Instrument retires.
**Display: Bungee** (fallback Jersey 10): marquee caps, title and area names. **Text: Space Grotesk**, 15–18px, labels and sentences (fallback Bricolage Grotesque). **HUD: Silkscreen**, caps, 16/24/32px only: keys, prompts, toasts, counters, screens (fallback VT323).

## 3 Colour
`ink #1a1c2c` plates, text; `paper #fff3d6` text on ink; `tangerine #ef7d57` accent 1, primary; `sun #ffcd75` accent 2, numbers; `sea #41a6f6` accent 3, secondary; `signal #a7f070` usable, collected; `night #10142e` washes.
Text: ink on paper, or paper, sun, signal on ink (12:1+); tangerine, sea on ink at 18px+ only. No bare text on the scene: ink plate (92%, 2px radius, hard shadow) or outline; no `backdrop-filter`. Pixel art: Sweetie-16 plus paper.

## 4 Entry
Centred title screen over the live scene, 35% night wash: HrM signature; small `THE` over huge `WORKSHOP` (paper, tangerine and ink hard shadows); one line; button; link.
Every word: `THE WORKSHOP`, `It changes when you look away.`, `PRESS ENTER` (touch `TAP TO ENTER`), `CLASSIC ↗`. Portuguese browsers: `Muda quando não estás a olhar.`, `ENTRAR`, `CLÁSSICO ↗`. Shared: their title, `or hang your own`.
Loading fills the button in 10 blocks; letters drop in `steps(4)`; ready blinks 1Hz; entering, the title swells away.

## 5 In-world UI
Three things max, plus crosshair. Crosshair: 4px dot; on target, signal corner brackets and one key cap, `[E] TALK`. Area name: top-centre Bungee 32px, 1.8s, once per area per 30s. Toast: bottom-centre, 6 words, 2.4s, newest replaces. Teach by doing: `WASD · MOUSE` until the first step; `CLICK TO PLAY` when unlocked. Top-left: signature, weather, sound; Hall label bottom-left.

## 6 Light
Fog is horizon-coloured: far is paler, bluer. Shadows carry sky colour, never black. Colour lives in materials; bloom only on glints, lamps, screens.
- **Day:** golden late afternoon, sun near 28°, long raking shadows, warm key 3× cool fill.
- **Night, the climax:** real Lisbon stars, dim blue moon, warm 2700K pools every 20m, lit windows, neon, fireflies; wet floors double each light.
- **Storm:** no sun shadows, dark glossy ground; lightning flickers within 150ms; thunder after distance ÷ 343m/s.
- **Rainbow:** centred opposite a low sun. Primary 42°, red outside; secondary 51°, reversed, fainter; darker sky between. Additive, behind geometry, vivid against slate cloud, over gold-lit wet ground.

## 7 Sound
1. Every world sound has a place and dulls with distance; only UI blips are chiptune.
2. One key, one clock: A minor pentatonic, 96 BPM; voices duck the bed 6dB.
3. Day sparse, night richest; after each big event, a beat of silence.

## 8 Perfect first
1. Arrival: lights rise as you step in; input answers instantly.
2. Move: raw mouse, crisp start and stop, slide along walls.
3. Use: look, brackets, `[E] verb`, sound and motion within 100ms.
4. 60fps, no hitch between areas.
5. Wonders: the Hall changes behind you; `T` turns the world in 3s.

Cut what fights flow: unprompted modals, second lines, pointer-lock thieves. "Slap" becomes "poke".

## 9 Indie touches
One impossible, kind trait in a real object, landing in 3s. Real body, pixel soul: PBR and scene-lit; 8-bit only on screens, bubbles, sounds (nearest filter, 256²); the ghost, the one sprite, is emissive and fogged. Each: ≤6 draw calls, 15k triangles, 1 texture, no shadow lights or per-frame allocations, awake within 40m. Found, not announced. Kind humour: no real people, politics, religions, ethnic groups, slurs, hate or sex. The school carries no words or names.
