#!/bin/bash
export LC_ALL=C
f=../video/remotion/public/recordings/$1.mp4
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)
args=(); i=0
for k in 0.03 0.2 0.4 0.6 0.8 0.97; do
  t=$(awk -v d="$d" -v k="$k" 'BEGIN{printf "%.3f", d*k}')
  ffmpeg -loglevel error -y -ss $t -i $f -frames:v 1 -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:0:gray" shots/_t$i.png
  args+=(-i shots/_t$i.png); i=$((i+1))
done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "[0][1][2][3][4][5]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0" shots/$1_sheet.png
