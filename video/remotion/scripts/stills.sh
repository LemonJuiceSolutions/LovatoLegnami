#!/usr/bin/env bash
# Fotogrammi di controllo in ../out/. Uso: bash scripts/stills.sh [frame-extra...]
set -euo pipefail
cd "$(dirname "$0")/.."
B=$(mktemp -d)/bundle
npx remotion bundle src/index.ts --out-dir="$B" >/dev/null
# frame chiave calcolati dalla timeline della voce
read -r INTRO_B S03 S07 OUT_A OUT_B < <(node -e '
const t=require("./src/data/vo-timing.json").scenes;const g=id=>t.find(s=>s.id===id);
const s1=g("01"),s3=g("03"),s7=g("07"),s9=g("09");
const cue=(s,i)=>s.from+s.voiceStartFrame+Math.round(s.cues[i].start*30);
console.log(cue(s1,s1.cues.length-1)+100, s3.from+400, s7.from+250, s9.from+80, s9.from+s9.durationInFrames-25)')
shot() { npx remotion still "$B" "$1" "../out/$2.png" --frame="$3" 2>&1 | grep -E "^\+|Error" || true; }
shot Espeiria16x9 intro-lovato 60
shot Espeiria16x9 intro-espeiria "$INTRO_B"
shot Espeiria16x9 scene03-screen "$S03"
shot Espeiria16x9 scene07-phone "$S07"
shot Espeiria16x9 outro-title "$OUT_A"
shot Espeiria16x9 outro-cta "$OUT_B"
shot Espeiria9x16 9x16-intro-espeiria "$INTRO_B"
shot Espeiria9x16 9x16-scene03-screen "$S03"
shot Espeiria9x16 9x16-outro-cta "$OUT_B"
