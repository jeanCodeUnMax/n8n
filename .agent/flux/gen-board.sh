#!/bin/bash
# usage: gen-board.sh <theme> <boardN> <startIconIdx> <prompt>
set -u
THEME="$1"; BOARD="$2"; START="$3"; PROMPT="$4"
OC="opencli --profile 9k9k8j4d browser icons"
ICON_DIR="extensions/hephaistos-chats/icon"
OUT_DIR="extensions/hephaistos-chats/media/agents/$THEME"
LOG=".agent/flux/icon-run.log"
BOARD_PNG="$ICON_DIR/$THEME-$BOARD.png"
ts(){ date +%H:%M:%S; }

# 1. textbox ref
REF=$($OC find --role textbox 2>/dev/null | grep -o '"ref": [0-9]*' | head -1 | grep -o '[0-9]*$')
if [ -z "$REF" ]; then echo "$(ts) [$THEME-$BOARD] FAIL no-textbox" | tee -a "$LOG"; exit 1; fi

# 2. loaded blob count before
PREV=$($OC eval "[...document.querySelectorAll('img')].filter(i=>i.src.startsWith('blob:')&&i.complete&&i.naturalWidth>=512).length" 2>/dev/null | grep -o '[0-9]*' | tail -1)
[ -z "$PREV" ] && PREV=0
echo "$(ts) [$THEME-$BOARD] ref=$REF prevLoaded=$PREV" | tee -a "$LOG"

# 3. fill + Enter
$OC fill "$REF" "$PROMPT" >/dev/null 2>&1
sleep 1
$OC keys Enter >/dev/null 2>&1
echo "$(ts) [$THEME-$BOARD] sent" | tee -a "$LOG"

# 4. poll for new loaded image (max ~300s)
READY=0
for i in $(seq 1 30); do
  sleep 10
  CNT=$($OC eval "[...document.querySelectorAll('img')].filter(i=>i.src.startsWith('blob:')&&i.complete&&i.naturalWidth>=512).length" 2>/dev/null | grep -o '[0-9]*' | tail -1)
  if [ -n "$CNT" ] && [ "$CNT" -gt "$PREV" ]; then READY=1; echo "$(ts) [$THEME-$BOARD] img-ready after $((i*10))s" | tee -a "$LOG"; break; fi
done
if [ "$READY" = "0" ]; then echo "$(ts) [$THEME-$BOARD] FAIL timeout" | tee -a "$LOG"; exit 2; fi
sleep 6  # settle

# 5. canvas -> b64 on LAST loaded blob img
RES=$($OC eval "(()=>{const imgs=[...document.querySelectorAll('img')].filter(i=>i.src.startsWith('blob:')&&i.complete&&i.naturalWidth>=512);const img=imgs[imgs.length-1];if(!img)return 'NOIMG';const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);window.__b64=c.toDataURL('image/png').split(',')[1];return 'B64LEN='+window.__b64.length+' DIM='+img.naturalWidth+'x'+img.naturalHeight;})()" 2>/dev/null | grep -o 'B64LEN=[0-9]* DIM=[0-9]*x[0-9]*' | tail -1)
echo "$(ts) [$THEME-$BOARD] $RES" | tee -a "$LOG"
BLEN=$(echo "$RES" | sed -n 's/.*B64LEN=\([0-9]*\).*/\1/p' | tr -dc '0-9')
if [ -z "$BLEN" ] || [ "$BLEN" -lt 10000 ]; then echo "$(ts) [$THEME-$BOARD] FAIL extract" | tee -a "$LOG"; exit 3; fi

# 6. chunked dump
rm -f /tmp/gb_*.b64
NCH=$(( (BLEN + 399999) / 400000 ))
ok=1
for ((i=0;i<NCH;i++)); do
  off=$((i*400000))
  $OC eval "window.__b64.slice($off,$off+400000)" > /tmp/gb_$i.b64 2>/dev/null
  sz=$(wc -c < /tmp/gb_$i.b64 | tr -d ' ')
  [ "$sz" -lt 100 ] && { echo "  chunk$i too small ($sz)"; ok=0; break; }
done
[ "$ok" = "0" ] && { echo "$(ts) [$THEME-$BOARD] FAIL chunks" | tee -a "$LOG"; exit 4; }

cat $(for ((i=0;i<NCH;i++)); do echo /tmp/gb_$i.b64; done) | tr -d '\n' | base64 -d > "$BOARD_PNG" 2>/dev/null
SZ=$(wc -c < "$BOARD_PNG" | tr -d ' ')
if [ "$SZ" -lt 50000 ]; then echo "$(ts) [$THEME-$BOARD] FAIL board-too-small $SZ" | tee -a "$LOG"; exit 5; fi
echo "$(ts) [$THEME-$BOARD] board=$SZ bytes" | tee -a "$LOG"

# 7. crop
powershell -NoProfile -ExecutionPolicy Bypass -File ".agent/flux/crop-board.ps1" -Board "$BOARD_PNG" -OutDir "$OUT_DIR" -StartIndex "$START" | tee -a "$LOG"
echo "$(ts) [$THEME-$BOARD] DONE" | tee -a "$LOG"
