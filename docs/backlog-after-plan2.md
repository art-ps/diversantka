# Отложено после плана 2 (анимация)

Из ревью плана 2; разобрать в следующих планах или при проверке ощущений.

- Task 1: minor (deferred): Frames: count not validated (NaN → 0 frames), trailing tokens ignored; truncated file error says "undefined"; framePositions out-of-range frame → raw TypeError
- Task 2: minor (deferred): resample loop float drift may drop last frame (use integer sample count); tiny loop range → empty clip with unclear error; validateClip speed/contacts values untested; no RED evidence
- Task 2: minor (deferred): heading from single frame `from` — takes that turn mid-clip not re-normalised
- Task 3: minor (deferred): no positive/loop-wrap test for velocity-gated contact; anim-data slide test partly circular now
- Task 4: minor (deferred): unused ANIM import in animator.test (plan-mandated); lastY:0 initial; clips.get(...)! throws if clip missing — validate CLIPS vs ANIM_NAMES at load
- Task 5: minor (deferred): no test for 3-line torso; hudCell boundary tests thin; CREDIT length magic 26/27; render constants not in ANIM (render, not feel)
- Task 6: minor (deferred): background-density test loose (name says ≤4/cell, asserts <1000 total); no tests for ~ ^ S tiles or bottom-row clearing
- Final review: deferred (reviewer triage): T1 parser edges, T2 resample/empty-loop/validation, T3 contact tests, T4 nits, T5/T6 test strength, jump anticipation timing, walk↔run hysteresis, climb phase by dt, README attribution line break → feel check / later plans
- Final review: residual (parked) — crouch clip descends over 1.5 s while hitbox drops instantly; Ruling: park for user's feel check and plan 3 (knife dodge needs fast crouch; fix = ANIM.crouchTime to time-scale crouch) — cost if wrong: crouch looks sluggish until then.
