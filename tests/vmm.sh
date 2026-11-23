#!/bin/sh
# usage: tests/vmm.sh out cols "id clip times" ...
out=$1; cols=$2; shift 2; F=""
for spec in "$@"; do set -- $spec; F="$F $(node tests/vm.mjs $1 $2 $3)"; done
python3 tests/montage.py tests/shots/$out.jpg $cols $F
