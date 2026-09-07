# Touch & accessibility polish

Tracking issue: #8 · Branch: `feat/touch-a11y`

## Goal
Bigger hit targets for kids, on-screen keyboard friendliness (inputs scroll into view under the keyboard), screen-reader labels on LED toggles, reduced-motion support.

## Design notes
- Hit targets grow in portrait only (the mounted orientation); the canvas scale already makes them larger physically on a 32" panel.
- `keyboardGuard()` in planner.js: when a field is focused and the visual viewport shrinks by more than 10%, keep the base scale and translate the canvas so the field bottom sits above the keyboard; restored on blur/resize.
- Semantics: `main`, `role=region` per panel, `role=switch` + `aria-checked` on LED toggles, `role=gridcell` + keyboard activation on days, `role=dialog aria-modal` on the modal, `aria-live` toast.
- `prefers-reduced-motion` drops transitions/animations and the LCD glow.

## Checklist
- [x] hit targets, focus rings, keyboard activation
- [x] ARIA roles/labels, live region, reduced motion
- [x] on-screen keyboard guard (tested in a touch/mobile context)
- [x] README / ROADMAP updated
