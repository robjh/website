from string import Template
from html.parser import HTMLParser
from urllib.parse import urlparse
from css_html_js_minify import html_minify, js_minify
import json

templates = {}

_domain = None
_uri    = None

_1KB = 0x400
_1MB = 0x100000
_1GB = 0x40000000

def load(url):
	global _domain, _uri
	with open("./template/master.html") as fd:
		templates["master"] = Template(fd.read())
	with open("./template/index_table_row.tpl") as fd:
		templates["index_table_row"] = Template(fd.read())
	with open("./template/index.tpl") as fd:
		templates["index"] = Template(fd.read())
	parsed   = urlparse(url)
	_domain  = parsed.netloc
	_uri     = parsed.path
	while (_uri and _uri[-1] == "/"): _uri = _uri[:-1]

_bodyless_tags = ["img","br","input"]

def domain():
	return _domain
def uri():
	return _uri

class Html_Node():
	def __init__(self, tag, attrs):
		self.name = tag
		self.attr = attrs
		self.children = []

	def __str__(self):
		if self.name == "undefined":
			return ""
		if self.name == "body":
			return self.build_children()

		attrs = ""
		for attr in self.attr:
			attrs += " {0}=\"{1}\"".format(attr[0], attr[1])

		if _bodyless_tags.count(self.name):
			return "<{0}{1}>".format(self.name, attrs)

		body = self.build_children()

		return "<{0}{1}>{2}</{0}>".format(self.name, attrs, body)

	def build_children(self):
		ret = ""
		for child in self.children:
			ret += str(child)
		return ret

class Html_Parser(HTMLParser):

	def __init__(self):
		super().__init__()
		self.state_stack = [self.State_Generic(self)]

	def clean(self):
		self.contents = None
		self.title = ""
		self.css = ""

	def data_passback(self, tag, data):
		if tag == "title":
			self.title = data
		if tag == "style":
			self.css = data

	class State_Base():
		def __init__(self, parent):
			self.parent = parent
		def start(self, tag, attr):
			raise Exception("Encountered unexpected start tag: <{}> on line {}.".format(tag, self.parent.getpos()[0]))
		def end(self, tag):
			raise Exception("Encountered unexpected end tag: </{}> on line {}.".format(tag, self.parent.getpos()[0]))
		def data(self, body):
			raise Exception("Encountered unexpected data: \"{}\" at {}".format(data.strip(), self.parent.getpos()[0]))

# There are three states; general, head and body.
# general is very strict and just serves to go between head and body
# head is somewhat strict and just looks for a few particular tags
# body is lacks and is used to build actual output

	class State_Generic(State_Base):
		def __init__(self, parent):
			super().__init__(parent)
			self._step = 0
		def start(self, tag, attrs):
			if self._step == 0 and tag == "html":
				self._step += 1
				self.parent.clean()
				return
			if self._step == 1 and tag == "head":
				self._step += 1
				self.parent.state_stack.append(Html_Parser.State_Head(self.parent))
				return
			if self._step == 2 and tag == "body":
				self._step += 1
				self.parent.state_stack.append(Html_Parser.State_Body(self.parent))
				return
			super().start(tag, attrs)
		def end(self, tag):
			if self._step == 3 and tag == "html":
				self._step += 1
				return
			super().end(tag)
		def data(self, data):
			if data.strip() != "":
				super().data(data)

	class State_Head(State_Base):
		def __init__(self, parent):
			super().__init__(parent)
		def start(self, tag, attr):
			if tag in ["title", "style"]:
				self.parent.state_stack.append(Html_Parser.State_Tag_GetData(self.parent, tag))
				return
		def end(self, tag):
			if tag == "head":
				self.parent.state_stack.pop()
				return
		def data(self, data):
			0 # ignore
	class State_Tag_GetData(State_Base):
		def __init__(self, parent, tag):
			super().__init__(parent)
			self.tag = tag
			self.extracted = ""
		def start(self, tag, attr):
			super().start(tag, attrs)
		def end(self, tag):
			if tag == self.tag:
				self.parent.state_stack.pop()
				self.parent.data_passback(self.tag, self.extracted.strip())
				return
			super().end(tag)
		def data(self, data):
			self.extracted += data

	class State_Body(State_Base):
		def __init__(self, parent):
			super().__init__(parent)
			self.parent.contents = Html_Node("body", None)
			self.stack = [self.parent.contents];
		def start(self, tag, attr):
			newnode = Html_Node(tag, attr)
			self.stack[-1].children.append(newnode)
			if not _bodyless_tags.count(tag):
				self.stack.append(newnode)
		def end(self, tag):
			if tag == "body":
				self.parent.state_stack.pop()
				return
			index = len(self.stack)
			while index:
				index -= 1
				if self.stack[index].name == tag:
					self.stack = self.stack[:index]
					break
		def data(self, data):
			if data.strip() != "":
				self.stack[-1].children.append(data)


	def handle_starttag(self, tag, attrs):
		self.state_stack[-1].start(tag, attrs)
	def handle_endtag(self, tag):
		self.state_stack[-1].end(tag)
	def handle_data(self, data):
		self.state_stack[-1].data(data)

class Html():
	subs = {}
	def __init__(self, title=None, body=None):
		self.subs = {
			"title":title,
			"body":body,
			"domain":_domain,
			"uri":_uri,
			"doctype":"html",
			"css":""
		}

	def title(self, str):
		self.subs["title"] = str

	def body(self, str):
		self.subs["body"] = str

	def parse(self, str):
		parser = Html_Parser()
		parser.feed(str)
		self.subs["body"] = parser.contents
		self.subs["title"] = parser.title
		self.subs["css"] = parser.css
		if parser.css:
			self.subs["css_header"] = "<style>{}</style>".format(parser.css)

	def render(self, minify):
		doc = templates['master'].substitute(self.subs)
		if (minify):
			return html_minify(doc)
		return doc

	def as_dict(self, minify):
		ret = {
			"type":  "html",
			"title": self.subs["title"],
			"body":  html_minify(self.subs["body"]) if minify else str(self.subs["body"])
		}
		if self.subs["css"] != "":
			ret["css"] = self.subs["css"]
		return ret

class Html_Index(Html):
	def __init__(self, path, index):
		super().__init__()
		self.path(path)
		self.index(index)
		self.subs["doctype"] = "dir"

	def path(self, str):
		self.title("Index of "+str)
		self._path = str

	def index(self, index):
		self.index = index

	def breadcrumb(self):
		dirs = self._path.split('/')
		ret = ""
		path = ""
		if (self._path == "/"):
			del dirs[1]
		for dir in dirs:
			path += dir + "/"
			ret += "<a href=\"{chroot}{path}\" data-path=\"{path}\" data-type=\"dir\">{text}/</a>".format(
				chroot=_uri, path=path, text=dir
			)
		return ret;

	def render(self, minify):
		# build index rows
		rows = []

		path = ""

		if ("/" != self._path):
			rows.append(templates['index_table_row'].substitute({
				"icon_url":  "{}/usr/share/icons/back.png".format(_uri),
				"icon_alt":  "PARENTDIR",
				"href":      "..",
				"data_path": "..",
				"data_type": "dir",
				"mime":      "Directory",
				"text":      "Parent Directory",
				"size":      str(0),
				"size_hr":   ""
			}))
			path = self._path

		for i in self.index:
			icon_url = "unknown.png"
			icon_alt = "???"

			if ("Directory" == i["mime"]):
				icon_url = "dir.png"
				icon_alt = "DIR"

			elif ("text/html" == i["mime"]):
				icon_url = "layout.png"
				icon_alt = "HTML"

			elif ("file" == i["type"]):
				icon_url = "binary.png"
				icon_alt = "FILE"

				if (i["mime"] in ["image/png", "image/jpeg"]):
					icon_url = "image2.png"
					icon_alt = "IMG"

			size_hr = ""
			if (i["size"] > _1GB):
				size_hr = "{:.2f}GB".format(i["size"]/_1GB)
			elif (i["size"] > _1MB):
				size_hr = "{:.2f}MB".format(i["size"]/_1MB)
			elif (i["size"] > 1000):
				size_hr = "{:.2f}KB".format(i["size"]/_1KB)
			elif (i["size"]):
				size_hr = "{}B".format(i["size"])

			rows.append(templates['index_table_row'].substitute({
				"icon_url":  "{}/usr/share/icons/{}".format(_uri, icon_url),
				"icon_alt":  icon_alt,
				"href":      "{}{}/{}".format(_uri, path, i["name"]),
				"data_path": "{}/{}".format(path, i["name"]),
				"data_type": i["type"],
				"mime":      i["mime"],
				"text":      i["name"],
				"size":      str(i["size"]),
				"size_hr":   size_hr
			}))
		self.subs["body"] = templates["index"].substitute({
			"index_table_row": str.join("",rows),
			"breadcrumb":      self.breadcrumb()
		})
		return Html.render(self, minify)

