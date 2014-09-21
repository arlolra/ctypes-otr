ctypes-otr
==========

Intro
-----

[Part][1] of the plan for the [TorMessenger][2].

[1]: https://trac.torproject.org/projects/tor/ticket/10210
[2]: https://trac.torproject.org/projects/tor/wiki/doc/TorMessenger

Dev Env
-------

Download a [nightly build of Instantbird][3], and create a profile,

```
instantbird -ProfileManager
```

On darwin,

```
brew install libgcrypt libotr
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
pwd > ~/Library/Application\ Support/Instantbird/Profiles/<profile>/extensions/ctypes-otr@tormessenger
```

On linux,

```
sudo apt-get install libgcrypt11-dev libotr-dev
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
pwd > ~/.instantbird/<profile>/extensions/ctypes-otr@tormessenger
```

Now launch Instantbird w/ OTR enabled. The default policy is optimistic
encryption. That means whitespace tags are appended to plaintext messages to
start OTR. To manually enforce it, try sending a message with just ?OTRv2,3?
or initiate with another client. Require encryption can be enabled in the
add-on settings.

[3]: http://ftp.instantbird.com/instantbird/nightly/latest-trunk/

Credits
-------

Inspired by [FireOTR](https://gitorious.org/fireotr).

License
-------

MPL v2.0