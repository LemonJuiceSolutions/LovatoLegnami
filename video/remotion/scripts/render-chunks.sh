#!/bin/bash
# Render a blocchi: video muto in 4 parti (+ retry per blocco), audio una volta sola, poi concat e mux.
# Uso: bash scripts/render-chunks.sh 16x9|9x16 [en]
#   en = versione inglese (composizione EspeiriaEN16x9, vo-timing.en.json, out/espeiria-lemonjuice-5min-EN-16x9.mp4)
set -u
C=$1; L=${2:-it}; OUT=../out
if [ "$L" = "en" ]; then COMP=EspeiriaEN$C; TJ=./src/data/vo-timing.en.json; NAME=espeiria-lemonjuice-5min-EN-$C; T=$OUT/chunks-EN-$C
else COMP=Espeiria$C; TJ=./src/data/vo-timing.json; NAME=espeiria-lemonjuice-5min-$C; T=$OUT/chunks-$C; fi
mkdir -p $T
TOTAL=$(node -p "require('$TJ').totalFrames")
LAST=$((TOTAL-1)); N=4; STEP=$(( (TOTAL + N - 1) / N ))
npx remotion bundle src/index.ts --out-dir=$T/bundle --log=error >/dev/null 2>&1 || { echo "bundle FAIL"; exit 1; }
: > $T/list.txt
for i in $(seq 0 $((N-1))); do
  A=$((i*STEP)); B=$(( (i+1)*STEP - 1 )); [ $B -gt $LAST ] && B=$LAST
  F=$T/part$i.mp4
  for try in 1 2 3; do
    [ -s $F ] && break
    echo "[$C] blocco $i ($A-$B) tentativo $try"
    npx remotion render $T/bundle $COMP $F --frames=$A-$B --codec=h264 --crf=19 --pixel-format=yuv420p --muted --concurrency=4 --timeout=180000 --log=error > $T/part$i.log 2>&1 || { echo "[$C] blocco $i errore: $(grep -m1 -E 'Error' $T/part$i.log)"; rm -f $F; }
  done
  [ -s $F ] || { echo "[$C] blocco $i FALLITO"; exit 1; }
  echo "file '$(pwd)/$F'" >> $T/list.txt
done
npx remotion render $T/bundle $COMP $T/audio.aac --codec=aac --log=error > $T/audio.log 2>&1 || { echo "[$C] audio FALLITO"; exit 1; }
ffmpeg -loglevel error -y -f concat -safe 0 -i $T/list.txt -i $T/audio.aac -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest $OUT/$NAME.mp4 || { echo "[$C] mux FALLITO"; exit 1; }
echo "[$C] FATTO $(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/$NAME.mp4) s"
