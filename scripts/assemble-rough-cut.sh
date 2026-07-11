#!/usr/bin/env bash
# Rough-cut assembler for the KeepSake film — PROOF OF CONCEPT, not the final edit. Lays each
# narration beat over its clip (real-app footage + AI soft-scenes), with dark slates for the
# motion-graphic beats we don't have as video (neuroscience, key-move, self-critique, credibility).
# Output: film-captures/rough-cut.mp4. Requires ffmpeg + the narration/soft/app clips already made.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAP="$ROOT/film-captures"; SOFT="$CAP/soft"; NAR="$CAP/narration"
SEG="$CAP/rough-cut-seg"; OUT="$CAP/rough-cut.mp4"
FONT="C\\:/Windows/Fonts/arial.ttf"  # escape the drive colon for ffmpeg's filter parser
mkdir -p "$SEG"; : > "$SEG/list.txt"
SESSION="$(ls "$CAP"/*session-never-cut.mp4 | head -1)"
REVIEW="$(ls "$CAP"/*review-agentic-report.mp4 | head -1)"

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
V="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30"

# beat <name> <video|SLATE:Label> <narration.mp3...>  (multiple narration files are concatenated)
beat() {
  local name="$1" src="$2"; shift 2
  local nar="$SEG/$name.nar.mp3"
  if [ "$#" -gt 1 ]; then
    local ins=() maps="" i=0
    for f in "$@"; do ins+=(-i "$f"); maps="${maps}[$i:a]"; i=$((i + 1)); done
    ffmpeg -y -loglevel error "${ins[@]}" -filter_complex "${maps}concat=n=$#:v=0:a=1[a]" -map "[a]" "$nar"
  else nar="$1"; fi
  local d; d="$(python -c "print(round($(dur "$nar")+0.5,2))")"
  local out="$SEG/$name.mp4"
  if [[ "$src" == SLATE:* ]]; then
    ffmpeg -y -loglevel error -f lavfi -i "color=c=0x1f1f1f:s=1920x1080:r=30:d=$d" -i "$nar" \
      -vf "drawtext=fontfile='$FONT':text='${src#SLATE:}':fontcolor=0xE9E2D6:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2" \
      -map 0:v -map 1:a -t "$d" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -ar 44100 "$out"
  elif [[ "$src" == IMG:* ]]; then  # a still image (Canva slide) held for the beat duration
    ffmpeg -y -loglevel error -loop 1 -i "${src#IMG:}" -i "$nar" \
      -filter_complex "[0:v]$V[v];[1:a]apad[a]" \
      -map "[v]" -map "[a]" -t "$d" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -ar 44100 "$out"
  else
    ffmpeg -y -loglevel error -i "$src" -i "$nar" \
      -filter_complex "[0:v]$V,tpad=stop_mode=clone:stop_duration=$d,trim=duration=$d,setpts=PTS-STARTPTS[v];[1:a]apad[a]" \
      -map "[v]" -map "[a]" -t "$d" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -ar 44100 "$out"
  fi
  printf "file '%s'\n" "$name.mp4" >> "$SEG/list.txt"; echo "  ok $name (${d}s)"  # basename: concat list resolves relative to itself
}

beat 01-hook       "$SOFT/01-hook-a.mp4"  "$NAR/01-hook.mp3"
beat 02-problem    "$SOFT/03-problem.mp4" "$NAR/02-problem.mp3"
beat 03-strain     "$SOFT/04-strain.mp4"  "$NAR/03-strain.mp3"
beat 04-neuro      "IMG:$CAP/canva-slides/neuroscience.png" "$NAR/04-neuroscience.mp3"
beat 05-keymove    "IMG:$CAP/canva-slides/keymove.png"      "$NAR/05-keymove.mp3"
beat 06-demo       "$SESSION" "$NAR/06-demo-probe.mp3" "$NAR/07-demo-miss.mp3" "$NAR/08-demo-distractor.mp3"
beat 07-jawdrop    "$REVIEW"  "$NAR/09-jawdrop.mp3"
beat 08-credibility "IMG:$CAP/canva-slides/credibility.png" "$NAR/10-credibility.mp3"
beat 09-close      "$SOFT/05-close.mp4"   "$NAR/11-close.mp3"

echo "concatenating..."
ffmpeg -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -c copy "$OUT"
echo "done -> $OUT ($(python -c "print(round($(dur "$OUT"),1))")s)"
