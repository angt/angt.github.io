port = 8000

all: $(patsubst %.txt,%.html,$(wildcard *.txt))

run: all
	@echo 'Running on http://$(shell myip):$(port)'
	@busybox httpd -f -p $(port)

%.html: %.txt my.css
	@echo 'Building $@'
	@pandoc -s $< -c my.css --to html5 -o $@

.PHONY: all run
