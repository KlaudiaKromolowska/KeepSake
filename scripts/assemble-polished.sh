#!/usr/bin/env bash
# Polished cut of the KeepSake film: warm color grade on every beat, slow Ken-Burns push on the
# still cards, per-beat fades (gentle transitions), a trimmed kiosk open on the demo, and a ducked
# music bed under the narration. Output: film-captures/polished-cut.mp4. Still an automated cut,
# not a hand-edit — but graded, scored, and transitioned.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAP="$ROOT/film-captures"; SOFT="$CAP/soft"; NAR="$CAP/narration"; SLIDE="$CAP/canva-slides"
SEG="$CAP/polished-seg"; OUT="$CAP/polished-cut.mp4"; MUSIC="$CAP/music/score.mp3"
mkdir -p "$SEG"; : > "$SEG/list.txt"
SESSION="$(ls "$CAP"/*session-never-cut.mp4 | head -1)"
REVIEW="$(ls "$CAP"/*review-agentic-report.mp4 | head -1)"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
GRADE="colorbalance=rs=0.04:gs=0.01:bs=-0.05:rm=0.03:bm=-0.04,eq=saturation=1.05:gamma=1.02"
FILL="scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30"

# beat <name> <IMG:file | VID:file | VIDSS:file:ss> <narration.mp3...>
beat() {
  local name="$1" src="$2"; shift 2
  local nar="$SEG/$name.nar.mp3"
  if [ "$#" -gt 1 ]; then
    local ins=() maps="" i=0
    for f in "$@"; do ins+=(-i "$f"); maps="${maps}[$i:a]"; i=$((i + 1)); done
    ffmpeg -y -loglevel error "${ins[@]}" -filter_complex "${maps}concat=n=$#:v=0:a=1[a]" -map "[a]" "$nar"
  else nar="$1"; fi
  local d fo; d="$(python3 -c "print(round($(dur "$nar")+0.6,2))")"; fo="$(python3 -c "print(round($d-0.4,2))")"
  local af="apad,afade=t=in:st=0:d=0.3,afade=t=out:st=$fo:d=0.4"
  local out="$SEG/$name.mp4"
  if [[ "$src" == IMG:* ]]; then
    local frames; frames="$(python3 -c "print(int($d*30))")"
    local vf="scale=2400:1350,zoompan=z='min(zoom+0.0006,1.12)':d=$frames:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,$GRADE,fade=t=in:st=0:d=0.5,fade=t=out:st=$fo:d=0.4"
    ffmpeg -y -loglevel error -loop 1 -i "${src#IMG:}" -i "$nar" -filter_complex "[0:v]$vf[v];[1:a]$af[a]" -map "[v]" -map "[a]" -t "$d" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -ar 44100 "$out"
  else
    local ss=0 file
    if [[ "$src" == VIDSS:* ]]; then local rest="${src#VIDSS:}"; file="${rest%:*}"; ss="${rest##*:}"; else file="${src#VID:}"; fi
    local cd tail; cd="$(python3 -c "print(round($(dur "$file")-$ss,3))")"; tail="$(python3 -c "print(round(max(0,$d-$cd),3))")"
    local base="$FILL,tpad=stop_mode=clone:stop_duration=$tail,trim=duration=$d,setpts=PTS-STARTPTS"
    local vf
    if [ "$(python3 -c "print(1 if $tail>2 else 0)")" = "1" ]; then
      # Short soft-scene clip: natural speed, then a gentle push-in on the held tail — never a dead freeze.
      local zinc; zinc="$(python3 -c "print(round(0.10/($d*30),7))")"
      vf="$base,zoompan=z='min(zoom+$zinc,1.11)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':fps=30:s=1920x1080,$GRADE,fade=t=in:st=0:d=0.4,fade=t=out:st=$fo:d=0.4"
    else
      # Long app footage: keep it CRISP and readable — no zoom (zoom softens UI text) — just grade.
      vf="$base,$GRADE,fade=t=in:st=0:d=0.4,fade=t=out:st=$fo:d=0.4"
    fi
    ffmpeg -y -loglevel error -ss "$ss" -i "$file" -i "$nar" -filter_complex "[0:v]$vf[v];[1:a]$af[a]" -map "[v]" -map "[a]" -t "$d" -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -ar 44100 "$out"
  fi
  printf "file '%s'\n" "$name.mp4" >> "$SEG/list.txt"; echo "  ok $name (${d}s)"
}

beat 01-hook       "VID:$SOFT/01-hook-a.mp4"       "$NAR/01-hook.mp3"
beat 02-problem    "VID:$SOFT/03-problem.mp4"      "$NAR/02-problem.mp3"
beat 03-strain     "VID:$SOFT/04-strain.mp4"       "$NAR/03-strain.mp3"
beat 04-neuro      "IMG:$SLIDE/neuroscience.png"   "$NAR/04-neuroscience.mp3"
beat 05-keymove    "IMG:$SLIDE/keymove.png"        "$NAR/05-keymove.mp3"
beat 06-demo       "VIDSS:$SESSION:5" "$NAR/06-demo-probe.mp3" "$NAR/07-demo-miss.mp3" "$NAR/08-demo-distractor.mp3"
beat 07-jawdrop    "VID:$REVIEW"                   "$NAR/09-jawdrop.mp3"
beat 08-credibility "IMG:$SLIDE/credibility.png"   "$NAR/10-credibility.mp3"
beat 09-close      "VID:$SOFT/05-close.mp4"        "$NAR/11-close.mp3"

echo "concatenating..."
ffmpeg -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" -c copy "$SEG/joined.mp4"
TOT="$(dur "$SEG/joined.mp4")"
if [ -f "$MUSIC" ]; then
  echo "mixing music bed..."
  local_fo="$(python3 -c "print(round($TOT-3,2))")"
  ffmpeg -y -loglevel error -stream_loop -1 -i "$MUSIC" -i "$SEG/joined.mp4" -filter_complex \
    "[0:a]atrim=0:$TOT,volume=0.15,afade=t=in:st=0:d=2,afade=t=out:st=$local_fo:d=3[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 1:v -map "[a]" -c:v copy -c:a aac -ar 44100 "$OUT"
else cp "$SEG/joined.mp4" "$OUT"; echo "(no music bed found — video only)"; fi
echo "done -> $OUT ($(python3 -c "print(round($(dur "$OUT"),1))")s)"
