#!/bin/bash


RESOURCES_DIR=misc
TARGET_DIR=posts
SRC_DIR=posts
FOOTER="<div id=\"footer\"><hr /> Last generated: "$(date "+%F %T")"</dev>"

SELF_INVOKE=$0


function convert_stream {
  cat - \
    | pandoc -f markdown -t html \
    | cat $RESOURCES_DIR/before.html - \
    | cat - <(echo $FOOTER) $RESOURCES_DIR/after.html \
    | tidy -asxml 2>/dev/null \
    | cat
}


function convert {
  # $1 is source
  # $2 is target
  $SELF_INVOKE convert < $1 > $2
}


function build {
  for file in $(ls $SRC_DIR); do
    SOURCE=$SRC_DIR/$file
    TARGET=$TARGET_DIR/${file%\.*}.html
    if [ "$SOURCE" -nt "$TARGET" ]; then
      echo "[make]: $SOURCE -> $TARGET ";
      convert $SRC_DIR/$file  $TARGET_DIR/${file%\.*}.html; 
    else
      echo "[skip]: $SOURCE (up to date)"
    fi
  done
}

function clean {
  rm -rf $TARGET_DIR/*
}


case $1 in
  "build") build;;
  "clean") clean;;
  "convert") convert_stream;;
  "-h"|"--help") echo "usage: $0 [build|clean|convert] (builds by default)";;
  *) build ;;
esac