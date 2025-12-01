#!/bin/sh

cd &&
git clone --bare https://github.com/angt/dotfiles .git &&
git config --bool core.bare false &&
git reset --hard HEAD &&
. ./.shell
