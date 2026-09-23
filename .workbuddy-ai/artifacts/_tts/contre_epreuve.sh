#!/bin/bash
# Contre-epreuve : le MEME banc sur la baseline (avant correctifs) doit ECHOUER
# sur les points 1c/1d (voix FR volee) et 2a/2b (pas de repli). Sinon le banc
# ne mesure rien.
cd /c/Theologicus
cp THEOLOGICUS.html .workbuddy-ai/artifacts/_tts/_actuel.html
git show HEAD:THEOLOGICUS.html > .workbuddy-ai/artifacts/_tts/_baseline.html
