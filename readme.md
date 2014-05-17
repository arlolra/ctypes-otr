ctypes-otr
==========

Intro
-----

[Part][1] of the plan for the [TorMessenger][2].

[1]: https://trac.torproject.org/projects/tor/ticket/10210
[2]: https://trac.torproject.org/projects/tor/wiki/doc/TorMessenger

Dev Env
-------

On darwin, but should work on your platform. Documentation contributions
are appreciated.

```
brew install libgcrypt
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
make osx
pwd > ~/Library/Application\ Support/Instantbird/Profiles/<profile>/extensions/ctypes-otr@tormessenger
```

Trying it out
-------------

Let's you're Karsten and you want to try it out.

First, install some dependencies,

```
sudo apt-get install zip unzip mercurial g++ make autoconf2.13 yasm \
libgtk2.0-dev libglib2.0-dev libdbus-1-dev libdbus-glib-1-dev libasound2-dev \
libcurl4-openssl-dev libiw-dev libxt-dev mesa-common-dev libgstreamer0.10-dev \
libgstreamer-plugins-base0.10-dev libpulse-dev libgcrypt11-dev
```

Then checkout this repository,

```
cd ~
mkdir Sandbox
cd Sandbox
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
make linux
```

Then we'll grab comm-central,

```
cd ~/Sandbox
hg clone http://hg.mozilla.org/comm-central
cd comm-central
python client.py checkout  # this can take a while
```

Cloning mozilla-central can take a while and fail. If so, try this,

```
cd ~/Sandbox
wget http://ftp.mozilla.org/pub/mozilla.org/firefox/bundles/mozilla-central.hg
cd comm-central
rm -rf mozilla
mkdir mozilla
hg init mozilla
cd mozilla
hg unbundle ~/Sandbox/mozilla-central.hg
hg update
echo -e "[paths]\ndefault = https://hg.mozilla.org/mozilla-central/" > .hg/hgrc
hg pull
hg update
cd ..
python client.py checkout  # should be much faster now
```

Now let's patch comm-central and build,

```
cd ~/Sandbox/comm-central
hg import --no-commit ~/Sandbox/ctypes-otr/patches/transform.patch
echo "ac_add_options --enable-application=im" > .mozconfig
./mozilla/mach build  # takes a while ... be prepared
// when finished, it'll complain that it can't find dist/bin/
// it's under mozilla/dist/bin
// try running the built Instantbird (also, to create a profile)
./obj-<platform>/mozilla/dist/bin/instantbird
```

Finally, we add the extension,

```
// exit Instantbird from the previous step
// be sure the profile dir is created
mkdir ~/.instantbird/<profile>.default/extensions
ln -s ~/Sandbox/ctypes-otr/ ~/.instantbird/<profile>.default/extensions/ctypes-otr@tormessenger
// now launch Instantbird w/ OTR enabled
~/Sandbox/comm-central/obj-<platform>/mozilla/dist/bin/instantbird
```

At this point, the default policy is optimistic encryption. That means
whitespace tags are appended to plaintext messages to start OTR. To manually
enforce it, try sending a message with just ?OTRv2,3? or initiate with
another client.

Credits
-------

Inspired by [FireOTR](https://gitorious.org/fireotr)

License
-------

MPL v2.0