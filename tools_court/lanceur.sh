#!/bin/sh
# Lanceur de bancs SÉQUENTIEL — remplace tools/bancs_shard.js dont le
# spawnSync échoue en EBUSY dans ce bac à sable.
# Usage : sh tools_court/lanceur.sh <fichier-liste> <fichier-resultat>
cd "$(dirname "$0")/.." || exit 2
LISTE="${1:-liste_bancs.txt}"
RES="${2:-resultats_bancs.txt}"
: > "$RES"
N=0; OK=0; ECH=0
while IFS= read -r b; do
  [ -z "$b" ] && continue
  N=$((N+1))
  # chemins Windows -> POSIX pour Git Bash
  f=$(printf '%s' "$b" | tr '\\' '/')
  out=$(timeout 300 node "$f" 2>&1)
  code=$?
  last=$(printf '%s\n' "$out" | grep -E 'RESULTAT|/[0-9]+ —|réussi' | tail -1)
  if [ "$code" -eq 0 ]; then
    OK=$((OK+1))
    printf 'OK    %-58s %s\n' "$b" "$last" >> "$RES"
  else
    ECH=$((ECH+1))
    printf 'ECHEC %-58s code=%s %s\n' "$b" "$code" "$last" >> "$RES"
    printf '%s\n' "----- détail $b (code $code) -----" >> "${RES}.detail"
    printf '%s\n' "$out" | tail -25 >> "${RES}.detail"
  fi
done < "$LISTE"
printf '\n===== %d bancs : %d OK, %d ECHEC =====\n' "$N" "$OK" "$ECH" | tee -a "$RES"
