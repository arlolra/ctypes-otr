ctypes-otr
==========

Intro
-----

Part 2 of the [plan][1] for [Attentive Otter][2].

[1]: https://gist.github.com/arlolra/6969273
[2]: https://trac.torproject.org/projects/tor/wiki/org/sponsors/Otter/Attentive

Dev Env
-------

On darwin, but should work on your platform. Documentation contributions
are appreciated.

```
brew install libgcrypt
git clone https://github.com/arlolra/ctypes-otr.git
cd ctypes-otr
make
pwd > ~/Library/Application\ Support/Firefox/Profiles/<profile>/extensions/ctypes-otr@timbb
```

Open FireFox and under the Tools menu, you should see `ctypes-otr`.

Credits
-------

Inspired by [FireOTR](https://gitorious.org/fireotr)

License
-------

MPL v2.0