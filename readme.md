[![Build Status](https://travis-ci.org/arlolra/ctypes-otr.svg?branch=master)](https://travis-ci.org/arlolra/ctypes-otr)

ctypes-otr
==========

Intro
-----

[Part][1] of the plan for the [Tor Messenger][2].

[1]: https://trac.torproject.org/projects/tor/ticket/10210
[2]: https://trac.torproject.org/projects/tor/wiki/doc/TorMessenger

Dev Env
-------

Download a [nightly build of Instantbird][3] and install it. Then create a profile,

On darwin,

```
~/Applications/Instantbird.app/Contents/MacOS/instantbird-bin -p
```

On linux,

```
instantbird -ProfileManager
```

Now clone this repo and link to the extension.

On darwin,

```
brew install libotr
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
mkdir -p ~/Library/Application\ Support/Instantbird/Profiles/<profile>/extensions
pwd > ~/Library/Application\ Support/Instantbird/Profiles/<profile>/extensions/ctypes-otr\@tormessenger
```

On linux,

```
sudo apt-get install libotr5-dev
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
mkdir -p ~/.instantbird/<profile>/extensions
pwd > ~/.instantbird/<profile>/extensions/ctypes-otr\@tormessenger
```

Now launch Instantbird and OTR should be enabled. This is confirmed by the
little lock in the top right of private conversations.

The default policies can be changed in `Tools > Add-ons > ctypes-otr > Preferences`.

[3]: http://ftp.instantbird.com/instantbird/nightly/latest-trunk/

Release
-------

```
export VERSION="X.X.X"
// bump the version numbers in package.json / install.rdf
git changelog  // edit
git commit -S -m "Release version $VERSION"
git tag -s $VERSION -m $VERSION
git push origin master
git push --tags
// bump the version numbers (+git) after the release
```

Credits
-------

Inspired by [FireOTR](https://gitorious.org/fireotr).

License
-------

MPL v2.0