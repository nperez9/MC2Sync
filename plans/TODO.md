# MC2Sync Migration — TODO

## Open Questions (to decide later)

- [ ] **Merge real implementation** — `buildMergedCard()` ya tiene implementación real (FAT rebuild). ¿Necesita soporte completo de multi-cluster dir entries para saves con muchos archivos?
- [ ] **Three.js** — ¿Mantener tal cual, lazy-load como chunk separado, o reemplazar con wrapper WebGL liviano?
- [ ] **Test data** — ¿Tenés archivos `.ps2` reales para usar en tests automatizados?
- [ ] **CSS approach** — ¿CSS Modules por componente o mantener el archivo CSS global actual?

---

## Phase 0: Setup ✅

- [x] Crear branch `refactor/ts-preact-migration`
- [x] Instalar dependencias: `preact`, `@preact/signals`, `typescript`, `@preact/preset-vite`, `@types/three`, `vitest`
- [x] Crear `tsconfig.json`
- [x] Crear `vite.config.ts` con plugin Preact
- [x] Crear `src/vite-env.d.ts` (CSS module declarations)
- [x] Borrar dead code: `counter.js`, `style.css`

## Phase 1: Domain Layer ✅

- [x] `src/domain/types.ts` — interfaces y tipos compartidos + Result type
- [x] `src/domain/ps2mc-parser.ts` — funciones puras, tipado estricto, caché de saves
- [x] `src/domain/ps2mc-writer.ts` — implementación real de buildMergedCard() con FAT rebuild
- [x] `src/domain/ps2mc-sync.ts` — remover circular import, tipado completo
- [x] `src/domain/ps2-icon-parser.ts` — fix alpha bit bug (`A1=0 → 0` no `255`)
- [x] `src/domain/game-database.ts` — fix duplicate key BASLUS-20665, usar Map

## Phase 2: Utils & Hooks ✅

- [x] `src/utils/binary.ts`
- [x] `src/utils/format.ts`
- [x] `src/utils/download.ts`
- [x] `src/hooks/use-file-drop.ts`
- [x] `src/hooks/use-three-renderer.ts` — fix resize listener leak (usa ResizeObserver)
- [x] `src/hooks/use-memory-card.ts`

## Phase 3: State Management ✅

- [x] `src/state/app-state.ts` — Preact Signals

## Phase 4: Preact Components ✅

- [x] `src/components/Header.tsx`
- [x] `src/components/CardLoader.tsx` — fix error recovery
- [x] `src/components/CardsSidebar.tsx`
- [x] `src/components/CardViewer.tsx` (incluye SaveRow)
- [x] `src/components/CardInspector.tsx` — sin setTimeout hack
- [x] `src/components/IconRenderer.tsx` — fix leak, usa hook
- [x] `src/components/SyncModal.tsx` — sin setTimeout hack, llama merge real
- [x] `src/components/Toast.tsx` — signal-driven

## Phase 5: App Shell ✅

- [x] `src/app.tsx`
- [x] `src/main.tsx`
- [x] `index.html` — DOM estático eliminado

## Phase 6: Styles ⬜ (pending Q4)

- [ ] Decidir CSS Modules vs global CSS
- [ ] Migrar inline styles a clases si se mantiene global CSS

## Phase 7: Cleanup & Polish 🔲

- [x] Borrar todos los `.js` viejos de `src/components/` y `src/lib/`
- [x] Borrar `src/main.js`, `src/counter.js`, `src/style.css`
- [ ] Borrar `test.obj` y `test-icon.js` del root
- [ ] ARIA attributes y keyboard navigation (parcialmente implementado)
- [ ] Tests unitarios para domain layer
- [ ] Verificación E2E de todas las features

## Status

**TypeScript compila sin errores ✅**
**Dev server corre en http://localhost:5174/ ✅**
