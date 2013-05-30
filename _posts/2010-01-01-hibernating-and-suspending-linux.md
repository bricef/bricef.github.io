---
title: Suspending and Hibernating on Linux
tags: [tutorial, linux, archlinux]
layout: post
---

Suspending and Hibernating on Linux
===================================

<p class="warning">
Note that this post is now outdated, and kept here only for historical reasons.</p>

A simple walkthrough to get hibernate and suspend working on Linux. More a reminder to myself than a walkthrough. Your distro wiki probably has far better instructions for you!

1. Download and install [uswsusp](http://suspend.sourceforge.net/). It's more than likely that your distro already provides it. (For example, `pacman -S uswsusp` on arch)

2. Download and install [pm-utils](http://pm-utils.freedesktop.org/wiki/) once again, check your repos.

3. Edit your `/etc/suspend.conf` file, creating it if neccessary. Add your swap partition to the `resume device` field. For example, my `suspend.conf` file looks like this:

        snapshot device = /dev/snapshot
        resume device = /dev/sda2
        #image size = 350000000
        #suspend loglevel = 2
        #compute checksum = y
        compress = y
        #encrypt = y
        #early writeout = y
        #splash = y
        shutdown method = shutdown

    Note how i've added a shutdown method and enabled compression.

4. Now, recreate the initramfs. To do this, edit the `/etc/mkinitcpio.conf` file and add `uresume` in the HOOKS list before the filesystem hook. Then, run

        > mkinitcpio -p kernel26

5. Now we need to let pm-utils know that we'll be using uswsusp. To do that create `/etc/pm/config.d/module` so tha it contains the following:

        SLEEP_MODULE=uswsusp

6. All done! Now use `pm-suspend` to suspend to RAM, `pm-hibernate` to suspend to disk and `pm-suspend-hybrid` to suspend to both, which is useful in case of a low battery. If your laptop is anything like mine, you'll have to invoke it as follows:

        > sudo pm-hibernate --quirk-dpms-on

You can bind that to a key, etc...

Extras
------
I want to have my laptop to hibernate whenever the battery gets below a certain level. I like to use [ACPID](http://acpid.sourceforge.net/). Setting up ACPID is really distro-specific, but since I use [Arch](http://www.archlinux.org), I'll go through setting up ACPID on Arch. (This is a reminder to self, after all.)

1. Install `acpi`, `acpid`, add acpid to the DAEMONS in `/etc/rc.conf`

2. Define an event catch in `/etc/acpi/events/` named low_battery_warning that looks like 

        event=battery.*
        action=/etc/acpi/low_battery_warning.sh %e


###Refs:
* [acpi howto](http://www.columbia.edu/~ariel/acpi/acpi_howto.txt)
* [acpi-low-bat](http://mindspill.net/computing/linux-notes/acpi/acpi-low-battery-warning.html)
* [acpid](http://wiki.archlinux.org/index.php/Acpid)
* [hibernate on low](http://bbs.archlinux.org/viewtopic.php?id=44080)
