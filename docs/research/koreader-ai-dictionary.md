# KOReader AI Dictionary Notes

## Current behavior

- Multi-word selections open KOReader's highlight popup, where the plugin's `AI Dictionary` button is visible.
- Single-word selections can skip the highlight popup and auto-open KOReader's normal offline dictionary. That bypasses the plugin's highlight button.
- Target the KOReader version actually installed on the device: `2026.03`.
- KOReader `2026.03` does not have `ReaderDictionary:addToDictButtons(spec)`. Use the older `DictButtonsReady` event to mutate dictionary popup buttons.
- The dictionary popup button should be one full-width row labeled `AI Dictionary`.
- Keep the offline dictionary as the default single-word behavior. The AI action should remain opt-in from the dictionary popup.

## Planned single-word approach

- Keep the existing multi-word highlight button.
- Add a dictionary popup button by handling `BooksAIDictionary:onDictButtonsReady(dict_popup, buttons)` and inserting a full button row, matching the working `assistant.koplugin` pattern for older KOReader builds.
- Reuse the same server lookup path and native dictionary rendering.
- Use `dict_popup.word` or `dict_popup.lookupword` for the selected term.
- Use `dict_popup.word_boxes` for result positioning when available.
- Use `dict_popup.highlight:getSelectedWordContext(40)` when highlight context exists; otherwise fall back to the selected word as the passage.
- The backend response contract is structured JSON: `{ "label": string, "definitions": string[] }`. The plugin escapes fields and renders dictionary HTML locally.

## Crash report

On 2026-07-06 around 21:18-21:20 CDT, tapping the current highlight-popup `AI Dictionary` button on KOReader for Android crashed the app repeatedly.

Device/runtime evidence from log:

- App: `org.koreader.launcher`
- Device: Samsung `dm2q`, Android 16 build `BP4A.251205.006/S916USQS8FZF5`
- ABI: `arm64`
- Crash: `SIGSEGV`, `SEGV_MAPERR`
- Backtrace includes `libGLESv2_adreno.so`, `libgsl.so`, `libluajit.so`, and `libluajit-launcher.so`
- One crash showed a null pointer dereference at fault address `0x17`.

Working suspicion:

- The trigger is the plugin flow, but the native crash appears in the Android/Adreno rendering path while LuaJIT is unwinding or exiting.
- Live proxy logs showed successful KOReader AI lookups and then one `POST /ai-dictionary/lookup` returning nginx `499`. That means KOReader disconnected while the request was in flight, so at least one crash/kill likely happened before the server response was rendered.
- Native dictionary and Wikipedia lookup paths wrap long-running work through KOReader's `Trapper`; the current plugin performs the HTTP request from a scheduled UI callback after showing an `InfoMessage`.
- Risky parts to revisit first are blocking the UI loop during HTTP, closing the highlight dialog before network work completes, showing/closing `InfoMessage`, and immediately showing a second `DictQuickLookup` from the scheduled callback.
- Before adding the dictionary-popup `AI` button, make the existing lookup flow more conservative: use the same `Trapper`/dismissable subprocess pattern as Wikipedia/OPDS, avoid unnecessary UI stacking, close the loading message before creating the dictionary widget, and consider showing errors/results in the existing dictionary popup path where possible.

## KOReader network/UI patterns observed

- Use `NetworkMgr:willRerunWhenOnline(callback)` at the top of interactive internet actions. If it returns true, abort the current call and let KOReader rerun the callback after network setup.
- Wrap long-running interactive flows in `Trapper:wrap(function() ... end)`. Built-in Wikipedia and dictionary lookup both do this before entering work that can block or use dismissable helpers.
- For multi-second HTTP/download work, use an `InfoMessage`, call `UIManager:forceRePaint()`, then run the blocking operation through `Trapper:dismissableRunInSubprocess(...)`.
- Code inside `dismissableRunInSubprocess` must not touch UI objects, mutate live KOReader state, or depend on full userdata/cdata. Pass only plain strings/tables and return only serializable primitive data.
- Use `socketutil:set_timeout(block, total)` plus `socketutil.table_sink(...)` for bounded HTTP work; reset timeout after the request.
- Treat `Trapper` dismissal as a normal result. Do not show a dictionary widget after a dismissed/interrupted request.
- Avoid showing a new modal widget immediately from an unguarded scheduled callback after closing another modal. Built-in flows either stay in `Trapper` or route back through existing reader modules.

Implication for this plugin:

- The current `UIManager:scheduleIn(... self:request(...) ...)` design is the wrong KOReader pattern for an AI lookup.
- The safer shape is: snapshot plain request data on tap, gate network, enter `Trapper:wrap`, show a repaintable/dismissable loading message, run HTTP in `dismissableRunInSubprocess`, then close loading and render the returned plain text through `showDict`.
