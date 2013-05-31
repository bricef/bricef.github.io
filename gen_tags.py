#!/usr/bin/env python

import os
from itertools import *
from functools import *

import yaml
import pystache

def take(n,xs):
  return list(islice(xs,0,n))

def first(xs):
  return take(1,xs)[0]

POST_DIR = "./_posts/"
TEMPLATE = "./tags/template/index.html"
TAGPATH = "./tags/{}/"
TAGFILE = "index.html"

filenames = [ os.path.join(POST_DIR,file) for file in os.listdir(POST_DIR)]

metas = []

for filename in filenames:
  try:
    metas.append(first((doc for doc in yaml.load_all(open(filename).read()))))
  except (yaml.scanner.ScannerError, UnicodeDecodeError, IOError):
    pass

tags = set(chain.from_iterable((meta["tags"] for meta in metas if "tags" in meta)))

template = open(TEMPLATE).read()

for tag in tags:
  target = os.path.join(TAGPATH.format(tag), TAGFILE)
  print("writing out tag '{}' summary to {}".format(tag,target))
  os.makedirs(os.path.split(target)[0], exist_ok=True)
  open(target,"w").write(pystache.render(template, {"tag":tag}))
