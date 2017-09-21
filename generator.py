#!/usr/bin/python3

import argparse
import os
import json
import css_html_js_minify
import mimetypes
from pprint import pprint

import template

def load_config(config_path):
	config = {}
	if os.path.isfile(config_path):
		with open(config_path) as fd:
			config = json.load(fd)

	if "files" not in config: config["files"] = {}
	return config

def copy_file(src, dest):
	with open(src, 'r') as fdr:
		with open(dest, 'w') as fdw:
			fdw.write(fdr.read())

# pray that it never comes to this :(
def delete_with_extreme_prejudice(path):
	print("Removing:", path)
	if os.path.isfile(path):
		os.remove(path)
	else:
		for root, dirs, files in os.walk(path, topdown = False):
			for file in files:
				os.remove(os.path.join(root,file))
			for dir in dirs:
				os.rmdir(os.path.join(root,dir))
		os.rmdir(path)

class Path_Reformatter:
	SRC    = 0
	S      = 0
	MUTUAL = 1
	M      = 1
	DEST   = 2
	D      = 2

	def __init__(self, src, dest):
		self.dir_src      = os.path.normpath(src)
		self.dir_dest     = os.path.normpath(dest)
		self.dir_src_len  = len(self.dir_src)  + 1
		self.dir_dest_len = len(self.dir_dest) + 1

	def src(self, type, path):
		if type == self.SRC:
			return path
		elif type == self.MUTUAL:
			return os.path.join(self.dir_src, path)
		elif type == self.DEST:
			return os.path.join(self.dir_src, path[self.dir_dest_len:])
		raise ValueError("Unrecognised type. Must be one of SRC, MUTUAL, DEST")

	def mutual(self, type, path):
		if type == self.SRC:
			return path[self.dir_src_len:]
		elif type == self.MUTUAL:
			return path
		elif type == self.DEST:
			return path[self.dir_dest_len:]
		raise ValueError("Unrecognised type. Must be one of SRC, MUTUAL, DEST")

	def absolute(self, type, path):
		return "/" + self.mutual(type, path)

	def dest(self, type, path):
		if type == self.SRC:
			return os.path.join(self.dir_dest, path[self.dir_src_len:])
		elif type == self.MUTUAL:
			return os.path.join(self.dir_dest, path)
		elif type == self.DEST:
			return path
		raise ValueError("Unrecognised type. Must be one of SRC, MUTUAL, DEST")

	def copy_file(self, mutual):
		with open(self.src(self.MUTUAL, mutual), 'r') as fdr:
			with open(self.dest(self.MUTUAL, mutual), 'w') as fdw:
				fdw.write(fdr.read())




def main():
	global webpage_template
	parser = argparse.ArgumentParser(description='Renders a website from a template of static files.')
	parser.add_argument('--skel', help='A directory containing the skeleton of the website.')
	parser.add_argument('--webdir', help='Directory where the site will be rendered to.')
	parser.add_argument('--url', help='The web facing address of --webdir')
	parser.add_argument('--minify', action='store_true', help='Runs HTML, Javascript and CSS files through a minifier.')
	parser.add_argument('--redirect', choices=['none', 'htaccess', 'symlink'], help='Choose how to redirect default_ajax_action.json to the right file for every directory. If "none" is chosen, you should make arrangements to perform the redirects some other way. eg, modifying the server config', default='htaccess')
	args = parser.parse_args()
	path = Path_Reformatter(src=args.skel, dest=args.webdir)

	template.load(args.url)


	config = load_config(os.path.join(path.dir_src, "config.json"))

	for path_src, dirs, files in os.walk(path.dir_src):
		if not os.path.exists(path.dest(path.SRC, path_src)):
			os.mkdir(path.dest(path.SRC, path_src))

		listing = os.listdir( path.dest(path.SRC, path_src) )
		index = []
		has_defaulthtml = False

		print("/"+path.mutual(path.SRC, path_src))

		for dir in dirs:
			if dir in listing: listing.remove(dir)
			destpath = os.path.join( path.dest(path.SRC, path_src) , dir)
			if os.path.isfile(destpath):
				os.remove(destpath)
			index.append({"name":dir,"type":"dir"})

		for file in files:
			ext = os.path.splitext(file)[1]
			mutualpath = path.mutual(path.SRC, os.path.join(path_src, file) )

			if mutualpath in config["files"]:
				if config["files"][mutualpath]["action"] == "ignore":
					continue
				if config["files"][mutualpath]["action"] == "raw":
					path.copy_file(mutualpath)
					index.append({"name":file, "type":"file"})
					if file in listing: listing.remove(file)
					continue

			if file in listing: listing.remove(file)

			if ext == ".html":
				if file+".json" in listing: listing.remove(file+".json")
				page = template.Html()
				with open(path.src(path.MUTUAL, mutualpath), 'r') as fd:
					page.parse(fd.read())

				with open(path.dest(path.MUTUAL, mutualpath), 'w') as fd:
					fd.write(page.render(minify=args.minify))

				with open(path.dest(path.MUTUAL, mutualpath) + ".json", 'w') as fd:
					fd.write(json.dumps(page.as_dict(minify=args.minify)))
				index.append({"name":file, "type":"html"})
			print("/"+mutualpath)

		# create index pages
		with open(os.path.join(path.dest(path.SRC, path_src), "index.html"), 'w') as fd:
			fd.write( template.Html_Index(path.absolute(path.SRC, path_src), index).render(minify=args.minify) )
			if "index.html" in listing: listing.remove("index.html")
		with open(os.path.join(path.dest(path.SRC, path_src), "index.html.json"), 'w') as fd:
			json_index = {}
			for item in index:
				json_index[item['name']] = item
			fd.write(json.dumps({
				"type":"dir",
				"children":json_index
			}))
			if "index.html.json" in listing: listing.remove("index.html.json")

		if args.redirect == "symlink":
			# create default_ajax_action.json symlink
			symlink = os.path.join(path.dest(path.SRC, path_src), "default_ajax_action.json")
			symlink_dest = "./index.html.json"
			if has_defaulthtml:
				symlink_dest = "./default.html.json"
			if os.path.exists(symlink):
				if not os.path.islink(symlink) or (os.readlink(symlink) != symlink_dest):
					if os.path.isdir(symlink):
						delete_with_extreme_prejudice(symlink)
					else:
						os.remove(symlink)
					os.symlink(symlink_dest, symlink)
			else:
				os.symlink(symlink_dest, symlink)
			if "default_ajax_action.json" in listing: listing.remove("default_ajax_action.json")
		elif args.redirect == "htaccess" and path.mutual(path.SRC, path_src) == "":
			with open(path.dest(path.MUTUAL, ".htaccess"), 'w') as fd:
				fd.write("""RewriteEngine On

RewriteCond %{DOCUMENT_ROOT}/$1default.html.json -f
RewriteRule ^(.*/)?default_ajax_action.json$ $1default.html.json [L]
RewriteRule ^(.*/)?default_ajax_action.json$ $1index.html.json [L]

DirectoryIndex default.html index.html
""")
				if ".htaccess" in listing: listing.remove(".htaccess")

		# remove any unexpected files in the web directory
		for misc in listing:
			delete_with_extreme_prejudice(os.path.join(path.dest(path.SRC, path_src), misc))

main()
