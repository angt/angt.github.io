cd &&
git clone --bare https://github.com/angt/dotfiles .shell.git &&
git --git-dir=.shell.git --work-tree=. reset --hard HEAD &&
. ./.shell
