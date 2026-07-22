# Grove Bronze Portrait and Oil Medallion — Design Specification

**Status:** approved direction. The original Blender-authored bust amendment below is explicitly approved; implementation is awaiting the written-spec review.

## 1. Purpose

Replace the Grove’s disjointed, primitive-built bust with a single convincing portrait monument. The Garden’s verified `mask-garden-face.webp` must appear as a physical oil-painted medallion carried by the portrait, not as a face texture, disc, screen, decal, or a replacement chaperone.

The outcome is a modest but memorable work inside the existing Grove roundabout: an aged bronze portrait with a small oil panel on its left breast. It is an artwork, not an NPC, guide, threshold, game object, or central entry rite.

## 2. Fixed composition

- **Existing setting retained:** current roundabout, stone pedestal, planted ring, approach and Grove proportions remain unchanged.
- **Object retained:** one human-scale portrait bust on the existing pedestal.
- **Object removed:** the primitive assembly currently used for the bust—lathed torso silhouette, rectangular lapels/sash/paint shards, loose medal blocks and spheres, black circular face cap, oversized red torus mouth, separate jaw/cranium stack, and decorative back grooves.
- **No substitute staging:** no gate, plinth extension, podium, extra plaque, screens, banners, portal effects, dialogue, interaction registration, or new object family.
- **Approach:** the visitor meets the portrait from the existing door/roundabout approach. It remains an object in the garden, never a navigation system or host.

## 3. Portrait sculpture

### Silhouette and anatomy

The bust is one coherent cast portrait, not a collection of parts:

- head, neck, shoulders and coat transition as a continuous sculptural volume;
- a slightly turned head and mild asymmetry prevent the front-on toy/emoji read;
- the face has restrained naturalistic planes: brow, nose bridge, cheek, jaw and closed mouth are shallow bronze modelling, not added spheres, discs, toruses or painted features;
- shoulders broaden into a stable, traditional bust base with a single continuous coat/collar mass;
- lapel and button cues, if retained, must be shallow cast relief or engraved lines, never floating boxes or spheres.

It should read as an institutional portrait that has weathered outdoors—credible at the current viewing distance rather than hyperreal close-up anatomy.

### Surface

Use a small, coherent material set:

- dark umber bronze base;
- warmer rubbed bronze on facial planes, shoulders and bezel edges;
- subdued green-grey verdigris only in creases, seams and sheltered undersides;
- high roughness / low metalness balance appropriate to weathered bronze, avoiding chrome, plastic black and cartoon gloss;
- no bright collage fragments, random primary-colour tiles, painted "WTF" decal, or disconnected metallic buttons.

The sculpture may retain a discreet, non-verbal trace of intervention through irregular patina and a few hand-applied pigment stains integrated into recesses—not through stickers or loose geometry.

### Approved original-bust amendment

The primitive-built and externally sourced head experiments both failed the arrival-view coherence criterion. The replacement is an **original Blender-authored complete portrait bust**:

- local source asset: `assets/models/grove-bronze-portrait.glb`, authored specifically for THE WORKSHOP;
- its head, neck, shoulders and upper chest are one continuous sculptural mesh, with no grafted scan, borrowed human likeness or runtime assembly of facial/body parts;
- its silhouette is deliberately modest and institutional: broad shoulders flowing into a low chest termination, a slightly turned head, and shallow asymmetric face planes that read at the Grove’s normal approach distance;
- it is exported as a lightweight local GLB, loaded through the existing GLTF pathway and given the Workshop’s weathered bronze material at runtime;
- no third-party portrait asset, licence attribution, external download or remote runtime model is involved.

The existing stone pedestal, planted ring, arrival composition, separate `mask-garden-face.webp` oil medallion, and silent/non-interactive boundary remain unchanged.

## 4. Oil-painted mask medallion

### Asset and framing

- Use the verified repository source `assets/extracted/mask-garden-face.webp`.
- Do not regenerate, replace, recolour or crop the source into a face-shaped sticker.
- Present it as a small **vertical oval oil panel**, mounted on the portrait’s left breast in a shallow, weathered bronze bezel/reliquary.
- The object has visible thickness: dark wood/board edge behind the painted surface, a thin irregular metal rim in front, and a small cast shadow against the coat.
- It must be legible as an artwork affixed to the portrait, like an unusual institutional decoration or reliquary—not a medal ribbon, UI badge, label or screen.

### Painted-material read

The mask must read as oil paint through construction and light, not merely the image bitmap:

- maintain sRGB colour handling and high anisotropy for the source image;
- use a low-sheen, non-emissive painting material with subtle roughness variation, avoiding the flat, uniformly matte standard map look;
- add a shallow painted-surface/edge treatment that creates a real plane, bevel and uneven perimeter without inventing fake brushwork over the verified artwork;
- add a small warm raking light from above and to one side, limited to the monument’s immediate area, so the panel’s rim and impasto image catch light separately from the bronze;
- keep the medallion small enough that it rewards approach rather than dominating the Grove arrival view.

## 5. Lighting

- Retain existing Grove daylight and garden light logic.
- Add only one restrained warm key/rake aimed at the portrait/medallion, with no dramatic spotlight cone, glow field or competing pool of light.
- Tune bronze roughness and the medallion’s rim so daylight gives form while the local raking light reveals material at approach.

## 6. Interaction and runtime boundary

The work remains silent and non-interactive:

- no `registerInteractable` for the bust or medallion;
- no guide, dialogue, oracle copy, prompt, hint, action, navigation target or state;
- no changes to Rooms, Projection, Garden Study or the retained Grove monument/pedestal context.

## 7. Acceptance criteria

### Visible

1. From the Grove arrival view, the monument reads as one cast bronze portrait on the existing stone pedestal—not separate head, neck, clothing and decoration parts.
2. The portrait has a believable silhouette in desktop arrival, lateral and reverse views.
3. The mask is visibly a small, framed/bezelled oil-painted object on the breast, with edge depth and different material response from the bronze.
4. No disc-face, black cylinder, plastic red mouth, floating coloured tiles/spheres, graffiti sticker or entry-rite-like staging remains.
5. The surrounding Garden, path, planting and principal sightline remain clear.

### Technical

1. The verified mask asset remains repository-backed and is not replaced by an unverified generated face.
2. No retired guide/chaperone identifiers or interaction registration returns.
3. The updated inline module parses; the relevant regression test asserts no guide restoration and the source remains free of the primitive bust markers removed by this pass.
4. Desktop and narrow mobile rendered views show no console/page errors and retain Rooms/normal navigation.

## 8. Out of scope

- redesigning the Grove, sky, landscape, pond, amphitheatre or portal architecture;
- adding a creator tool or new Garden workflow;
- general material-system refactoring;
- changing the mask artwork itself;
- new character mechanics, audiovisual dialogue or visitor progress mechanics.
