---
title: Dynamic, Static and Automatic memory
tags: [programming, c]
layout: post
published: true
---

This was originally a [Stackoverflow answer](http://stackoverflow.com/a/15793111/140264).

## Dynamic memory allocation

Is memory allocated at runtime using `calloc()`, `malloc()` and friends. It is sometimes also referred to as 'heap' memory, although it has nothing to do with the heap data-structure [<sup>ref</sup>][1].

    int * a = malloc(sizeof(int));

Heap memory is persistent until `free()` is called. In other words, you control the lifetime of the variable.

## Automatic memory allocation
This is what is commonly known as 'stack' memory, and is allocated when you enter a new scope (usually when a new function is pushed on the call stack). Once you move out of the scope, the values of automatic memory addresses are undefined, and it is an [error to access them](http://stackoverflow.com/a/6445794/140264). 

    int a = 43;

Note that scope does not necessarily mean function. Scopes can nest within a function, and the variable will be in-scope only within the block in which it was declared. Note also that where this memory is allocated is not specified. (On a _sane_ system it will be on the stack, or registers for optimisation)

## Static memory allocation
Is allocated at compile time, and the lifetime of a variable in static memory is the [lifetime of the program](http://en.wikipedia.org/wiki/Static_variable). 

In C, static memory can be allocated using the `static` keyword. The scope is the compilation unit only. 

Things get more interesting [when the `extern` keyword is considered](http://en.wikipedia.org/wiki/Extern_variable). When an `extern` variable is _defined_ the compiler allocates memory for it. When an `extern` variable is _declared_, the compiler requires that the variable be _defined_ elsewhere. Failure to declare/define `extern` variables will cause linking problems, while failure to declare/define `static` variables will cause compilation problems.

in file scope, the static keyword is optional (outside of a function):

    int a = 32;

But not in function scope (inside of a function):

    static int a = 32;

Technically, `extern` and `static` are two separate classes of variables in C.

    extern int a; /* Declaration */
    int a; /* Definition */

## Register Memory
The last memory class are 'register' variables. As expected, register variables should be allocated on a CPU's register, but the decision is actually left to the compiler. You may not turn a register variable into a reference by using address-of. 

    register int meaning = 42;
    
    /* this is wrong and will fail at compile time. */
    printf("%p\n",&meaning); 

Most modern compilers are smarter than you at picking which variables should be put in registers :)

## References:
 * [The libc manual](http://www.gnu.org/software/libc/manual/html_node/Memory-Allocation-and-C.html)
 * K&R's [The C programming language](http://cm.bell-labs.com/cm/cs/cbook/), Appendix A, Section 4.1, "Storage Class". ([PDF](http://net.pku.edu.cn/~course/cs101/2008/resource/The_C_Programming_Language.pdf))
 * [C11 standard](http://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf), section 5.1.2, 6.2.2.3
 * Wikipedia also has good pages on [Static Memory allocation](http://en.wikipedia.org/wiki/Static_memory_allocation), [Dynamic Memory Allocation](http://en.wikipedia.org/wiki/Dynamic_memory_allocation#Dynamic_memory_allocation) and [Automatic memory allocation](http://en.wikipedia.org/wiki/Automatic_memory_allocation)
 * The [C Dynamic Memory Allocation page](https://en.wikipedia.org/wiki/C_dynamic_memory_allocation) on Wikipedia
 * This [Memory Management Reference](http://www.memorymanagement.org/index.html) has more details on the underlying implementations for dynamic allocators.


  [1]: http://www.quora.com/Why-is-dynamic-memory-allocation-called-heap-memory-allocation "ref"