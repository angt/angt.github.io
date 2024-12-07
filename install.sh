#!/bin/sh

cd || exit

remote() (
	exec 2>/dev/null >/dev/null
	git remote add "$1" "$2" || true
	git remote set-url "$1" "$2"
	git remote set-url --push "$1" "$3"
)

git init

remote origin https://github.com/angt/dotfiles gh:angt/dotfiles
remote gitlab https://gitlab.com/angt/dotfiles gl:angt/dotfiles

git fetch --all

Y=
printf "Hard reset ? "
read -r Y

case "$Y" in
([Yy]*) git reset --hard origin/master ;;
(*)     git reset origin/master ;;
esac
