index.html: index.txt my.css
	pandoc -s $< --css=my.css --to html5 -o $@

run: index.html
	busybox httpd -f -p 8000
