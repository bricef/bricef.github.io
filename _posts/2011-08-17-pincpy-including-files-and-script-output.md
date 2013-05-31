---
title: Including files and script output in Markdown
layout: post
tags: [python, markdown]
---

Markdown: Including files and script output 
===========================================

Problem Statement
-----------------
Ever since I came across markdown, I always wanted to be able to include an external file inside a markdown document. This would allow easy structuring and organisation of large markdown documents. A good example would be to put together some code level documentation, or a multi-part report. 

To make it even more useful, I'd also like to be able to include the output from a script directly in my markdown file, which would be really useful for examples and dynamic reports. A good use case for this would be to include the latest results fetched from the web for a report, or to statically generate a webpage using the latest server stats.

Syntax Extension
----------------
In order to do all this, I propose two extensions to the markdown syntax. This first, "Include file verbatim" would look like this:

    ...
    (> filename <)
    ...

This directive would take one full line and replace itself with the contents of the file. Additionally, since this is markdown, I want to be able to specify by how much the included file will be indented. To do this, the directive simply needs to be indented:

    ...
    some text
        (> filename <)
    some more text
    ...
 
This additional syntax can now be extended for executable scripts too:

    ...
    (!> script --args A B C <)
    ...

In this case, The script should be executed and its output included in the markdown source. Indentation has the same effect as above.

Implementation
--------------
The implementation, it turns out, is pretty straight forward. Python's `re`, `shlex` and `subprocess` module make this a breeze:

{% highlight python %}
import sys
import re
import shlex
import subprocess as sp
 
exe_pat = re.compile(r'(\s*)\(!>(.*)<\)\s*')
inc_pat = re.compile(r'(\s*)\(>(.*)<\)\s*')
 
if __name__ == "__main__":
  for line in sys.stdin:
    match_exe = re.match(exe_pat, line)
    match_inc = re.match(inc_pat, line)

    if match_exe:
      space = match_exe.group(1)
      exe = match_exe.group(2).strip()
      args = shlex.split(exe)
      sys.stdout.writelines(
        map(
          lambda x: space+x+"\n", 
          sp.check_output(args).split("\n")))

    elif match_inc:
      space = match_inc.group(1)
      inc = match_inc.group(2).strip()
      sys.stdout.writelines(
        map(
          lambda x: space+x, 
          open(inc)))

    else:
      sys.stdout.write(line)
{% endhighlight %}

Use
---
Using this module is as straight forward as it gets. Simply pipe in some output and redirect:

    $ ./pinc.py < inputfile.md > outputfile.md

A neat trick can easily turn `pinc.py` into a quine:

    $ echo "(> ./pinc.py <)" | ./pinc.py

Easy peasy! Interestingly, since this implementation is just a shell filter, it can be used outside of markdown too. I use it to build web pages and dynamic reports. My scripts output vaild markdown, and are included in a report template. You could use `pinc.py` for LateX, html, or any other text based format. 

Further Work
------------
There's several limitations to this implementation, and a few possible improvements:

* Allow recursive includes. At the moment recursive includes are not allowed, which could be useful, especially for literate programming.
* Create a mechanism for capturing stderr as well as stdout.
* Create a mechanism for prefixing every included line with an arbitrary prefix instead of just whitespace.
* Package the functionality into a python package for inclusion into [python-markdown](http://www.freewisdom.org/projects/python-markdown/).

Conclusion
----------
There's a reason why I love Python. In a few minutes I put together a really useful filter that pulls together a lot of functionality: We've got subprocess being spawned, regular expression parsing, and we even use the functional features to modify every line with an anonymous function. Awesome!

Hope this motivates you to go and scratch your own itch too!

