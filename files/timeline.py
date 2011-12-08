#!/usr/bin/env python

#
# to create a visualisation, run like this:
# 
#    ./timeline.py --dot | dot -Tpng > filename.png
#


import sys
import random
from pprint import pprint

file = "names.txt"

names = open(file, "r").read().split("\n")

history = []

dot = False
if len(sys.argv) > 1 and sys.argv[1] == "--dot":
  dot = True

def wrap(str, wrap='"'):
  return wrap+str+wrap

def merge(states, names):
  number = random.randint(2,3)
  mergers = [] 
  if number < len(states):
    mergers = random.sample(states, number)
    new_name = random.choice(names)
    states = list(set(states).difference(set(mergers)))
    states.append(new_name)
    names.remove(new_name)
    if dot:
      for state in mergers:
        print '"%s" -> "%s"'%(state, new_name)
      print '{rank=same; %s }'%wrap(new_name)
    else:
      print "MERGE %s ==> '%s'"%( ", ".join(map(wrap,mergers)), new_name)
  return states, names 


def split(states, names):
  number = random.randint(2,3)
  if number < len(names):
    splitter = random.choice(states)
    states.remove(splitter)
    new_states = random.sample(names, number)
    names = list(set(names).difference(set(new_states)))
    states = list(set(states).union(set(new_states)))
    if dot:
      for state in new_states:
        print '"%s" -> "%s"'%(splitter, state)
      print '{rank=same; %s }'%("; ".join(map(wrap, new_states)))
    else:
      print "SPLIT '%s' ==> %s"%(splitter, ", ".join(map(wrap,new_states)))
  return states, names

def revolt(states, names):
  old = random.choice(states)
  new = random.choice(names)
  names.remove(new)
  states.remove(old)
  states.append(new)
  if dot:
    print '"%s" -> "%s"'%(old, new)
    print '{rank=same; "%s"}'%new
  else:
    print "REVOLT '%s' ==> '%s'"%(old, new)
  return states, names

def conquest(states, names):
  if len(states) > 1:
    loser = random.choice(states)
    states.remove(loser)
    winner = random.choice(states)
    if dot:
      print '"%s" -> "%s" [label="conquered by"]'%(loser, winner)
    else:
      print "CONQUEST '%s' conquered '%s'"%(winner, loser)
  return states, names
   

#ignore empty names
names = [name for name in names if name] #yes, really.

origin = random.sample(names, random.randint(1,3))
names = list(set(names).difference(set(origin)))
history.append(origin) #random starting states

if dot:
  print "digraph g {"
  print "{rank=same; %s}"%("; ".join(map(wrap,origin)))
else:
  print("BEGIN %s"%(", ".join(map(wrap,history[0]))))

while names:
  func = random.choice([merge, split, revolt, conquest])
  states, names = func(history[-1], names)
  history.append(states)

if dot:
  print '{rank=same; %s}'%("; ".join(map(wrap,history[-1])))
  print "}"
else:
  print "END %s"%(", ".join(map(wrap,history[-1])))
  




