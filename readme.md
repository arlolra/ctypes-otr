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
make
pwd > ~/Library/Application\ Support/Instantbird/Profiles/<profile>/extensions/ctypes-otr@timb
```

Credits
-------

Inspired by [FireOTR](https://gitorious.org/fireotr)

License
-------

MPL v2.0