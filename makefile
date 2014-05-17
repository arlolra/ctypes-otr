SHELL := /bin/bash
OTR := libotr-4.0.0
VERSION := $(shell cat install.rdf|grep '<em:version>' \
	| cut -d\> -f2 | cut -d\< -f1)

all: clean libotr xpi

build:
	mkdir -p build/

xpi: build
	zip -r build/ctypes-otr-$(VERSION).xpi * \
		-x \*.git\* -x \*build\* -x "makefile" -x $(OTR).tar.gz

libotr: build
	if [ ! -f $(OTR).tar.gz ]; \
		then wget https://otr.cypherpunks.ca/$(OTR).tar.gz; \
        fi;
	rm -rf build/$(OTR);
	tar -xzvf $(OTR).tar.gz -C build/;
	cd build/$(OTR); ./configure; make;

clean:
	rm -rf build/

osx: all
	cp build/$(OTR)/src/.libs/libotr.dylib chrome/content/

linux: all
	cp build/$(OTR)/src/.libs/libotr.so.5.0.0 chrome/content/libotr.so

.PHONY: all build xpi libotr clean linux osx
