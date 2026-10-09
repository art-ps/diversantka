# Отложено после плана 1 (ядро)

Из ревью ядра; разобрать в планах 2–4.

- Task 1: minor (deferred): room.ts _exits destructure; '--- ' with trailing space → misleading error; duplicate header key overwrites; tileAt/loadWorld untested
- Task 2: review — Important: .vitest/json/output.json committed (generated artifact); minor (deferred): no left-wall moveX test
- Task 3: minor (deferred): macOS Cmd held → keyup lost, keys stick until blur; preventDefault also fires with Cmd/Ctrl (blocks Cmd+W etc.); stick Y 0.5 unnamed
- Task 4: minor (deferred): nina.ts:57 ladderTop comment vague after +EPS; climb-up moveY unbounded if ladderTop returns -1 (no reachable path found)
- Task 5: minor (deferred): bloom has no threshold → bg brightens with glow; mediump in glyph FS; getUniformLocation per frame, no checkFramebufferStatus; draw() relies on Bloom.begin viewport; Google Fonts CDN only weight 500 vs atlas default weight (self-host font later)
- Task 6: minor (deferred): TRANSITION_TIME and low-energy 25 outside config.ts; boot() without .catch, fullscreen promises unhandled; game.test while(!g.transition) unbounded; horizontal exits checked before vertical
- Final review: deferred to later plans (from reviewer triage): T1 room-format nits; T2 left-wall test; T3 stick 0.5; T4 ladderTop -1 / climb unbounded + validator geometry checks (before plan 4 rooms); T5 render polish + self-host font (deploy plan); T6 unbounded test loop, exit order; new: Retina atlas size 48→dpr; HUD hides cave ladder top cells; up held blocks ladder jump-off; ladders need 3-cell clearance
