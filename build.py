# Builds the site from src.html + app.js + catalog.json + sample.json.
#   index.html     full standalone page, served by GitHub Pages
#   artifact.html  the same page without the document wrapper, for the claude.ai preview
s = open("src.html", encoding="utf-8").read()
s = s.replace("/*__ROSTER__*/", open("sample.json", encoding="utf-8").read().replace("</", r"<\/"))
s = s.replace("/*__CATALOG__*/", open("catalog.json", encoding="utf-8").read().replace("</", r"<\/"))
s = s.replace("/*__APP__*/", open("app.js", encoding="utf-8").read())
open("artifact.html", "w", encoding="utf-8").write(s)
head, sep, body = s.partition("</style>")
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Free formation planner for Game of Thrones: Dragonfire.  Builds and explains your Vanguard and flank lineups.">\n'
        + head + sep + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")
open("index.html", "w", encoding="utf-8").write(page)
