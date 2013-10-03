---
title: Arithmetic without arithmetic operators 
tags: [programming, praxis, interview-question]
layout: post
published: false
---

Arithmetic operations without arithemtic operators
==================================================

As part of preparing for interviewing candidates for a software engineering position, I am reading through [Cracking The Coding Interview](http://www.crackingthecodinginterview.com/).

Obviously, the first thing I did when I received my copy was turn to _chapter 18: Hard Problems_ and try my hand at some of those. The first problem will be familiar for anyone who has gone through a course on Digital Design, or read through [The Elements of Computing Systems](http://www.nand2tetris.org/).

> Write a function that adds two numbers. You should not use any arithmetic operators.

Since this is a common interview question, I'll go through my approach and solution as well as some possible alternatives. 

<!-- I'll then try to implement all other arithemitic operators `-`, `/`, `*` using a similar approach. -->

Breaking down the problem
-------------------------


The first thing to realise is that this is a bit manipulation problem. We're essentially asked to reconstruct an arithmetic operator from more primitive bit operations. These include  

Instead of trying to tackle the entire problem in one go, we'll first consider the case of adding two one-bit integers. 

### The Half Adder

The only two possible values of a one-bit integer are 0 and 1. This gives us four possible 
operations which we can represent in a truth table :

               Result
    A  B  Base 10  Base 2
    0  0     0        0
    1  0     1        1
    0  1     1        1
    1  1     2       10 # oops o_O

As we can see from the last entry, just like in base ten arithmetic, we have the possibility of carrying over to the next column when our number is too big for our current order. (eg 5 + 5 = 10<sub>10</sub>).

Now, we can look at our truth table again, but this time, we will add a second output to take the carry bit into consideration:

    A  B  Carry  Result 
    0  0    0      0    
    1  0    0      1    
    0  1    0      1
    1  1    1      0

Now we can start thinking about how to implement this using [bitwise operations](http://en.wikipedia.org/wiki/Bitwise_operation). Since this is a pretty simple example, we can quickly come to the conclusion by inspection that:

    Result = A XOR B 
    Carry =  A AND B 

Which is easy enough to implement:

{% highlight python %}

def HalfAdder(A, B):
  result = A ^ B
  carry = A & B
  return carry, result

{% endhighlight %}

### The Full Adder

Now, if we consider the addition of two two-bit numbers, we can see that while the Half Adder is sufficient for the first bit, the second bit of the result will have to take into consideration whether the previous operation returned a carry or not. This give us a new more complex truth table:

    A  B  Cin  Carry  Result
    0  0   0     0     0
    1  0   0     0     1
    0  1   0     0     1
    1  1   0     1     0 # So far same as half adder
    0  0   1     0     1
    1  0   1     1     0
    0  1   1     1     0
    1  1   1     1     1

Once again, we can convert this truth table to boolean expressions:

    Carry = (A AND Cin) OR (B AND Cin) OR (A AND B)
    Result = A XOR B XOR C

There are formal ways of turning truth tables into strictly minimum boolean expressions by using [boolean algebra](http://en.wikipedia.org/wiki/Boolean_algebra), but for small examples like this, inspections should do the trick. Whichever way we go, we can now implement a full adder:

{% highlight python%}

def FullAdder(A,B,C):
  carry = A ^ B ^ C
  result = (A & C) | (B & C) | (A & B)
  return carry, result

{% endhighlight %}

## From Full Adder to 32bit Adder

Once we have a single bit full adder, we can simply chain them together to add any integers. We simply pass the  

## Alternative 

## Implementing Negation
## Implementing Substraction
## Implementing Multiplication
## Implementing Division


Further reading
===============

 * [Hardware Algorithms for arithmetic modules](http://www.aoki.ecei.tohoku.ac.jp/arith/mg/algorithm.html)
 * [Worked example converting truth table to Boolean expression](http://www.allaboutcircuits.com/vol_4/chpt_7/9.html)


