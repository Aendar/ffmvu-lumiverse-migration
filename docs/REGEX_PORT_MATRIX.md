# Regex migration matrix — SillyTavern -> Lumiverse

Lumiverse's native Regex Import accepts SillyTavern-shaped JSON and converts:
- numeric placement 1 -> user_input, 2 -> ai_output;
- markdownOnly -> display target;
- promptOnly -> prompt target;
- both booleans -> both display + prompt targets;
- /pattern/flags literals -> separate pattern + JS flags.

## Import directly

| Legacy script | Action | Notes |
|---|---|---|
| SFX · Warm Accent | IMPORT | ai_output/display. Inline span styling is self-contained. |
| HideCombatCalc | IMPORT | ai_output/display only, matching the supplied ST flags. |
| HideStoryAnalysis | IMPORT | ai_output/display only. |
| Hide Location | IMPORT | user_input + ai_output/display. |
| HideUpdateVar | IMPORT | ai_output with display + prompt targets. Do not add response target: FFMVU state evidence must remain available to the commit pipeline. |
| Colorize | IMPORT with v0.10 extension | The regex itself is portable. v0.10 injects the npc palette and generic --npc-color CSS into the Lumiverse host, replacing the old #chat .mes_text selectors. |

## Import after one edit

### MinimizeCombatLog

Lumiverse documents native replacement captures as $1, $&, and $<name>. The legacy replacement uses $0 for the whole match.

Change:

```text
$0
```

to:

```text
$&
```

The existing <details> layout can then be smoke-tested. If its embedded <style> becomes awkward under Lumiverse HTML Islands, move that CSS into the extension-owned stylesheet just like Colorize.

## Do not import

| Legacy script | Replacement |
|---|---|
| GameStartMenu — configurable v3 | Native v0.10 New Game form -> StateService.startNewGame |
| StatusMenu FF + MVU v2.8.1 | Native persistent v0.10 Spindle Drawer StatusMenu |

Both legacy UI scripts depend on the SillyTavern/MVU iframe environment (window.parent, message variables/MVU APIs, iframe lifecycle and legacy chat DOM). Importing them would preserve the regex match but not the runtime they expect.

## Colorize CSS ownership

The legacy regex remains:

```text
/§([0-9_-])([\s\S]{1,3000}?)§\1/g
```

and emits a span with `--npc-color`. The v0.10 frontend now owns the palette:

```css
:root {
  --npc-c_: #F56991;
  --npc-c0: #58DDD0;
  --npc-c1: #45CAC1;
  --npc-c2: #36B5AF;
  --npc-c3: #439E9B;
  --npc-c4: #719493;
  --npc-c5: #FFAD68;
  --npc-c6: #F49A68;
  --npc-c7: #E38869;
  --npc-c8: #CF7C6D;
  --npc-c9: #B87874;
  --npc-c-: #B8A6D9;
}
span[style*="--npc-color"],
span[style*="--npc-color"] * { color: var(--npc-color) !important; }
span[style*="--npc-color"] em {
  color: var(--npc-color) !important;
  filter: brightness(.84) saturate(.9);
  opacity:.78;
  font-style:italic;
}
```

No SillyTavern `#chat .mes_text` selector is required.
