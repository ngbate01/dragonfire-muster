# Builds index.html from src.html + app.js + sample.json
s=open("src.html",encoding="utf-8").read()
s=s.replace("/*__ROSTER__*/",open("sample.json",encoding="utf-8").read().replace("</",r"<\/"))
s=s.replace("/*__CATALOG__*/",open("catalog.json",encoding="utf-8").read().replace("</",r"<\/"))
s=s.replace("/*__APP__*/",open("app.js",encoding="utf-8").read())
open("index.html","w",encoding="utf-8").write(s)
