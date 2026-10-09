# Отложено после плана 3а (бой)

- Task 1: minor (deferred): flykick doesn't return to stance (animator fades to fall); death hands below floor (-0.20); punch/kick tests only check reach
- Task 2: minor (deferred): patrol regex unanchored; odd message for '@1,2'
- Task 3: minor (deferred): ladder branch of «attack not started» untested; weak 'stops' assertion; jump buffer wiped during ground attack; ground attack continues after walking off edge; regen during stun/punch; skid after stun landing; Attack.hits unused until T5
- Task 4: minor (deferred): throw during attack has no throw pose (guard on attack?); throw/pickup in air glitches pose; no chooseClip 'throw' test; crouch-throw into floor dies at once
- Task 5: minor (deferred): no assert that a living android resets on room change; throw game test coupled to android windup; android loses sight during Nina's jump; patrol over spikes in lab-1
- Task 5: minor (deferred): projectile wasted on invulnerable android (consistent with melee)
- Task 6: minor (deferred): scene test doesn't cover knife direction glyphs / held item / blink
- Final review: deferred (reviewer triage): T1–T6 minors as listed in ledger; throw with down always diagonal-down (spec-consistent, playtest)
- Финальная правка: толчок ногой возвращает центр андроида в участок; толкается и убитый (без эффекта); край тела андроида у x 15.4 касается колонки шипов (урона андроидам от тайлов нет).
