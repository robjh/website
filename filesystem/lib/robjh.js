var robjh = (function() {

	var rob = {};
	var g = {};

	rob.use_cookies = ao.cookies._store.optin == "true";
	g.use_storage = true;
	if (typeof(Storage) !== "undefined" && localStorage.robsh_use_storage) {
		rob.use_storage = (localStorage.robsh_use_storage == ture);
	}

	g.sessionStorage_works = (function() {
		var supported = true;
		try {
			var x = '__storage_test__';
			window.sessionStorage.setItem(x, x);
			if (sessionStorage.getItem(x) != x) {
				supported = false;
			}
			window.sessionStorage.removeItem(x);
		} catch (e) {
			supported = false;
			console.info("session storage unsupported. threw: " + e);
		}
		return supported;
	})();

	var split_path = (function(fullpath) {
		var loc = fullpath.lastIndexOf('/');
		return {
			name: fullpath.substr(loc + 1),
			path: fullpath.substr(0, loc)
		};
	});

	var fs = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = {};

// By default, the only known directories are /bin and /usr/bin.
// if the PWD is known, it will also be created.
// Other directories will be created when the user asks to see them.
// if localstorage is enabled, changes will be cached there.

		self.chroot = argv.chroot;

		// controls the minimum time between directory refreshes
		self.expires = argv.expires || 3600;

		argv.node_class = argv.node_class || fs.node;

		self.root = argv.node_class({
			fs: self,
			node_class: argv.node_class
		});
		if (argv.hint) {
			self.root.apply_update_recursive(argv.hint);
		}
		if (g.sessionStorage_works) {
			var saved_fs = window.sessionStorage.getItem('fs');
			if (saved_fs) {
				self.root.apply_update_recursive(JSON.parse(saved_fs));
			}
		}
		self.save = (function() {
			if (!g.sessionStorage_works) return false;
			var node_data = JSON.stringify(self.root.serialise());
			window.sessionStorage.setItem('fs', node_data);
			console.log(node_data);
			return true;
		});

		(function(node) { // /bin/
/*{{{*/
			var pwd = ao.process_simple.wrapper("pwd", function(ctrl) {
				ctrl.ostream([ctrl.shell.pwd(), ctrl.ostream.nl]);
			});

			var cd = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "cd";

				var path = '~';
				var force_index = false;
				var working_node;
				var cd_result;

				argv.states = ao.object_merge({
					args: function() {
						for (var i = 1, l = p.argv.length ; i < l ; ++i) {
							switch (p.argv[i]) {
							  case '-h':
							  case '--help':
								self.ostream([
									"Usage: cd [option] path", self.ostream.nl,
									"Available options:",
									ao.dom_node("dl", {appendChild: [
										ao.dom_node("dt", {text: "--help (-h)"}),
										ao.dom_node("dd", {text: "Display this text."}),
										ao.dom_node("dt", {text: "--index (-i)"}),
										ao.dom_node("dd", {text: "Force a directory listing in the page output. If a default.html file exists in the target directory, it will be ignored."}),
									]})
								]);
								return p.exit();
								break;

							  case '-i':
							  case '--index':
								force_index = true;
								break;

							  default:
								if (p.argv[i].startsWith('-')) {
									self.ostream([p.argv[0]+': '+p.argv[i]+': Invalid option.', self.ostream.nl]);
									return p.exit();
								} else {
									path = p.argv[i];
								}
								break;
							}
						}
						return p.continue("setup");

					},
					setup: function() {
						argv.shell.cd_ajax(path, function(node, result) {
							working_node = node;
							cd_result    = result;
							argv.term.interupt();
						}, force_index);
						return p.yield("resolve_dir");
					},
					resolve_dir: function() {
						switch (cd_result) {
						  case argv.shell.cd_ajax.result.not_found:
							self.ostream([p.argv[0]+': '+path+': No such file or directory.', self.ostream.nl]);
							break;

						  case argv.shell.cd_ajax.result.not_dir:
							self.ostream([p.argv[0]+': '+path+': Not a directory.', self.ostream.nl]);
							break;

						  case argv.shell.cd_ajax.result.ok:
							if (!force_index && working_node.children['default.html']) {
								working_node.path_resolve_ajax('default.html', function(node) {
									working_node = node;
									argv.term.interupt();
								});
								return p.yield("render_page");
							} else
								return p.continue("render_page");
							break;

						  default:
							self.ostream([p.argv[0]+': '+path+': Unknown Error.', self.ostream.nl]);
						}

						return p.exit();
					},
					render_page: function() {
						g.page.node_change(working_node);
						return p.exit();
					}
				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			var echo = ao.process_simple.wrapper("echo", function(ctrl, p) {
				p.argv.shift();
				ctrl.ostream([p.argv.join(' '), ctrl.ostream.nl]);
			});

			var ls = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "ls";

				var working_node;

				argv.states = ao.object_merge({
					find_node: function() {
						working_node = argv.pwd;
						if (p.argv[1]) {
							working_node.path_resolve_ajax(p.argv[1], function(node) {
								working_node = node;
								argv.term.interupt();
							}, true);
							return p.yield("output");
						}
						return p.continue("output");
					},
					output: function() {
						if (!working_node) {
							self.ostream([
								p.argv[0],
								': cannot access ',
								p.argv[1],
								': No such file or directory',
								self.ostream.nl
							]);
						} else {
							var ul = ao.dom_node('ul', {
								className: "lscmd"
							});
							self.ostream(ul);

							var keys = Object.keys(working_node.children).sort(function(a,b) {
								if (working_node.children[a].type() == fs.types.dir) {
									if (working_node.children[b].type() != fs.types.dir) {
										return false;
									}
								} else if (working_node.children[b].type() == fs.types.dir) {
									return true;
								}
								return a > b;
							});
							for (var i = 0, l = keys.length ; i < l ; ++i) {
								if (keys[i].startsWith('.')) continue;
								var node = working_node.child_get(keys[i]);
								if (
									node.is_dir &&
									node.children['default.html'] &&
									node.children['default.html'].is_html
								) {
									node = node.children['default.html'];
								}

								var li = ao.dom_node('li', {
									className: "lscmddir"
								});
								var content = document.createTextNode(keys[i]);
								if (node.linkable) {
									content = ao.dom_node('a', {
										data: {
											path: node.path()
										},
										href: node.url(),
										appendChild: content
									});
									if (node.event_click) {
										content.setAttribute("onclick", node.event_click);
										content.onclick = node.event_click;
									}
								}
								li.appendChild(content)
								ul.appendChild(li);
							}
						}

						return p.exit();
					},
				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			var cat = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "cat";

				var working_node = argv.pwd;

				argv.states = ao.object_merge({
					find_node: function() {
						if (p.argv[1]) {
							working_node.path_resolve_ajax(p.argv[1], function(node) {
								working_node = node;
								argv.term.interupt();
							}, true);
							return p.yield("output");
						}
						return p.continue("output");
					},
					output: function() {
						if (!working_node) {
							self.ostream([
								p.argv[0],
								': cannot access ',
								p.argv[1],
								': No such file or directory',
								self.ostream.nl
							]);
						} else {
							self.ostream(working_node.gen_page());
						}

						return p.exit();
					},
				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			var mkdir = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "mkdir";

				var working_node = argv.pwd;
				var new_dir_name;

				argv.states = ao.object_merge({
					setup: function() {
						var details = split_path(p.argv[1]);
						new_dir_name = details.name;
						if (details.path) {
							working_node.path_resolve_ajax(details.path, function(node) {
								working_node = node;
								argv.term.interupt();
							});
							return p.yield("create");
						}
						return p.continue("create");
					},
					create: function() {

						if (!working_node) {
							self.ostream([p.argv[0] + " cannot create directory '" + p.argv[1] + "': No such file or directory.", self.ostream.nl]);
						} else if (working_node.children[new_dir_name]) {
							self.ostream([p.argv[0] + " cannot create directory '" + p.argv[1] + "': File exists.", self.ostream.nl]);
						} else {
							var newdir = working_node.mkdir(new_dir_name);
							newdir.local = true;
							working_node.fs.save();
							if (g.page.node == working_node) {
								g.page.reload();
							}
						}

						return p.exit();
					}
				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			var rmdir = ao.process_simple.wrapper("rmdir", function(ctrl, p) {
				var path = ctrl.argv[ctrl.argv.length-1];
				var node = ctrl.pwd.path_resolve(path);
				if (!node) {
					ctrl.ostream([
						'rmdir: Failed to remove \'' + path + '\': No such file or directory.',
						ctrl.ostream.nl
					]);
					return;
				}
				if (!node.is_dir) {
					ctrl.ostream([
						'rmdir: Failed to remove \'' + path + '\': Not a directory.',
						ctrl.ostream.nl
					]);
					return;
				}

				var name = node.name();
				node = node.parent_get();
				node.child_remove(name);
				node.fs.save();

				if (g.page.node == node) g.page.reload();
			});

			var cowsay = ao.process_simple.wrapper("cowsay", function(argv, p) {
				if (!argv.istream.eof) {
					this.yield = true;
					return;
				}
				this.yield = false;

				this.ostream([
					ao.dom_node('div', {
						appendChild: argv.term.prepare_output(this.istream()),
						className: 'cowsay_box'
					}),
					ao.dom_node('pre', {
						text: (
							"        \\   ^__^\n" +
							"         \\  (oo)\________\n"+
							"            (__)\        )\\/\\\n"+
							"                ||----w |\n"+
							"                ||     ||"
						)
					})
				]);
			});

			var clear = ao.process_simple.wrapper("clear", function(ctrl, p) {
				ctrl.term.clear();
			});

			var empty = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "empty";

				argv.states = ao.object_merge({
				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			node.child_set("pwd",     fs.element_exec({ constructor: pwd     }));
			node.child_set("cd",      fs.element_exec({ constructor: cd      }));
			node.child_set("echo",    fs.element_exec({ constructor: echo    }));
			node.child_set("ls",      fs.element_exec({ constructor: ls      }));
			node.child_set("cat",     fs.element_exec({ constructor: cat     }));
			node.child_set("mkdir",   fs.element_exec({ constructor: mkdir   }));
			node.child_set("rmdir",   fs.element_exec({ constructor: rmdir   }));
			node.child_set("cowsay",  fs.element_exec({ constructor: cowsay  }));
			node.child_set("clear",   fs.element_exec({ constructor: clear   }));

			node.child_set("dir",     node.child_get('ls'));
			node.local = true;
/*}}}*/
		}(self.root.path_resolve_create('/bin', 'dir')));

		(function(node) { // /usr/bin/
/*{{{*/
			var cookies = (function(argv, p) {
				argv     = argv   || {};
				p        = p      || {};
				p.name   = p.name || "cookies";

				p.usage = "Usage: cookies [options] [cookie name [cookie value [expiration offset]]]";
				p.do_help = (function() {
					self.ostream([
						p.usage, self.ostream.nl,
						"Given no parameters, the default action is --list.", self.ostream.nl,
						"Given just a cookie name, the value of the cookie will be printed.", self.ostream.nl,
						"If the value is also specified, the cookie will be set.", self.ostream.nl,
						"Available options:",
						ao.dom_node("dl", {
							appendChild: p.do_help_switches()
						})
					]);
				});
				p.do_help_switches = (function() {
					return [
						ao.dom_node("dt", {text: "--help (-h)"}),
						ao.dom_node("dd", {text: "Display this text."}),
						ao.dom_node("dt", {text: "--enable <expiration offset>"}),
						ao.dom_node("dd", {text: "Opt-in to using cookies on this site. A cookie will be set to indicate you have opted in. Expiration offset affects the lifetime of the optin cookie, and is optional. If left unset a default value of \"30d\" will be used."}),
						ao.dom_node("dt", {text: "--disable"}),
						ao.dom_node("dd", {text: "Opt-out of using cookies on this site. All cookies will also be removed immediatly. Cookies are initially disabled."}),
						ao.dom_node("dt", {text: "--status"}),
						ao.dom_node("dd", {text: "Report the current cookie status. Either Enabled or Disabled."}),
						ao.dom_node("dt", {text: "--list (-l)"}),
						ao.dom_node("dd", {text: "Display all the cookies used on this site."}),
						ao.dom_node("dt", {text: "--set (-s) <cookie name> <cookie value> <expiration offset>"}),
						ao.dom_node("dd", {text: "Set a cookie. This command will not work if cookies have not been enabled yet. If the cookie already exists it will be overwritten. Set value to '-' to read from standard input. Expiration offset is optional, and represents a time in the future. By default the value is in Microseconds, this can be changed by appending the correct units. eg; 7d"}),
						ao.dom_node("dt", {text: "--delete (-d) <cookie name>"}),
						ao.dom_node("dd", {text: "Delete a cookie."}),
					];
				});

				p.do_list = (function() {
					if (!c.length) return; // no cookies, do nothing
					var table = ao.dom_node("table");
					for (var cookie in c.store) {
						table.appendChild(ao.dom_node("tr", {
							appendChild: [
								ao.dom_node("td", { text: cookie } ),
								ao.dom_node("td", { text: c.store[cookie] } )
							]
						}));
					}
					self.ostream(table);
				});

				var c = ao.cookies();
				var m_name;
				var m_value;
				var m_print_cookies = false;

				p.handle_argv = (function() {
					var ret = false;
					if (p.argv_act("help", /h/, p.do_help)) ret = true;

					if (p.argv_act("list", /l/)) {
						m_print_cookies = true;
						ret = true;
					}

					if (p.argv_act("enable", null, function(index) {
						var offset = p.argv[index + 1] || "30d";
						if(c.set("optin", "true", offset)) {
							rob.use_cookies = true;
							c.commit();
						} else {
							self.ostream(["Did not understand \""+argv[index+1]+"\", and cookies have not been enabled.", self.ostream.nl]);
						}
					})) ret = true;

					if (p.argv_act("disable", null, function() {
						c.remove_all();
						rob.use_cookies = false;
						self.ostream(["Cookies have been disabled, and existing cookies have been destroyed.", self.ostream.nl]);
					})) ret = true;

					if (p.argv_act("status", null, function() {
						self.ostream([rob.use_cookies ? "Enabled" : "Disabled", self.ostream.nl]);
					})) ret = true;


					if (p.argv_act("delete", /d/, function(index) {
						if (p.argv.length < (index + 2)) {
							self.ostream(["Missing required parameter <name>.", self.ostream.nl]);
							return;
						}
						var cookie_name = p.argv[index + 1];
						if (!c.store[cookie_name]) {
							self.ostream(["Couldn't find a cookie with the name \""+cookie_name+"\".", self.ostream.nl]);
							return;
						}
						c.remove(cookie_name);
					})) ret = true;

					p.argv_act("set", /s/, function(index) {
						var bail = false;
						if (!rob.use_cookies) {
							self.ostream(["Cookies are currently disabled. enable them with `cookies --enable`.", self.ostream.nl]);
							bail = true;
						}
						if (p.argv.length < (index + 2)) {
							self.ostream(["Missing required parameter <name>.", self.ostream.nl]);
							bail = true;
						}
						if (p.argv.length < (index + 3)) {
							self.ostream(["Missing required parameter <value>.", self.ostream.nl]);
							bail = true;
						}
						if (!c.validate(p.argv[index + 2])) {
							self.ostream(["Parameter <value> contains illegal chatacters.", self.ostream.nl]);
							bail = true;
						}
						if (bail) {
							self.ostream(["Usage: cookies --set <name> <value> [Expiration offset]", self.ostream.nl]);
							return;
						}
						m_name   = p.argv[index + 1];
						m_value  = p.argv[index + 2];
						m_offset = p.argv[index + 3];

					});

					return ret;
				});

				argv.states = ao.object_merge({
					setup: function() {
						if (p.handle_argv()) {
							return p.continue("cleanup");
						}
						if (m_value) {
							return p.continue(
								m_value == "-" ? "wait_for_stdin"
								               : "set"
							);
						}

						switch (p.argv.length) {
							case 0:
								self.ostream(["too few arguments, somehow.", self.ostream.nl]);
								break;
							case 1:
								p.do_list();
								break;

							case 2: // single param, print a cookie and exit
								if (c.store[p.argv[1]]) {
									self.ostream([c.store[p.argv[1]], self.ostream.nl]);
								} else {
									self.ostream(["Cookie not found: \""+p.argv[1]+"\".", self.ostream.nl]);
								}
								break;

							// 2 or 3 params. update the cookie
							case 4:
								m_offset = p.argv[3];
							case 3:
								m_value  = p.argv[2];
								m_name   = p.argv[1];

								if (!rob.use_cookies) {
									self.ostream(["Cookies are currently disabled. enable them with `cookies --enable`.", self.ostream.nl]);
									break;
								}

								return p.continue(
									m_value == "-" ? "wait_for_stdin"
									               : "set"
								);


							default:
								self.ostream(["Too many arguments. Remember to put your value in quotation marks.", self.ostream.nl]);
								break;
						}
						return p.continue("cleanup");

					},
					wait_for_stdin: function() {
						if (!self.istream.eof) {
							return p.yield();
						}
						m_value = self.istream();
						return p.continue("set");
					},
					set: function() {
						if (!c.validate(m_value)) {
							self.ostream(["Parameter <value> contains illegal chatacters.", self.ostream.nl]);
						} else {
							if (c.set(m_name, m_value, m_offset)) {
								c.commit();
							} else {
								self.ostream([
									"Could not understand offset param \""+m_offset+"\".", self.ostream.nl,
									"The cookie was not set.", self.ostream.nl
								]);
							}
						}
						return p.continue("cleanup");
					},
					cleanup: function() {
						if (m_print_cookies) p.do_list();
						return p.exit();
					}

				}, argv.states);

				var self = ao.process_sm(argv, p);

				return self;
			});

			var local_data = ao.state_machine({ states: {
				setup: function(self) {
					self.shell.pwdnode.path_resolve_ajax("/usr/bin/", self.term.interupt);
					self.yield = true;
					return self.fnc.yield("cleanup");
				},
				cleanup: function(self) {
					self.yield = false;
					return self.fnc.yield("setup");
				}
			}});

			var sudo = (function() {

			});

			var uname = ao.process_simple.wrapper("uname", function(argv, p) {
				this.ostream([navigator.userAgent, this.ostream.nl]);
			});

			var hello_user = ao.process_simple.wrapper("hellouser", function(argv, p) {
				var input = this.istream();
				if (!input) {
					this.yield = true;
					this.ostream(["What's your name?", this.ostream.nl]);
				} else {
					if (input instanceof Array) input = input[0];
					this.yield = false;
					this.ostream(["Hello ", input, ". ", this.ostream.nl]);
				}
			});

			var rewritepage = ao.process_simple.wrapper("page", function(argv, p) {
				if (!this.istream.eof) {
					this.yield = true;
				} else {
					this.yield = false;
					var msg = argv.term.prepare_output(this.istream());
					g.page.content_replace(msg);
				}
			});

			var breakpoint = ao.process_simple.wrapper("breakpoint", function(argv, p) {
				void(node.fs);
				debugger;
			});

			node.child_set("cookies",     fs.element_exec({ constructor: cookies     }));
//			node.child_set("sudo",        fs.element_exec({ constructor: sudo        }));
			node.child_set("uname",       fs.element_exec({ constructor: uname       }));
			node.child_set("hellouser",   fs.element_exec({ constructor: hello_user  }));
			node.child_set("page",        fs.element_exec({ constructor: rewritepage }));
//			node.child_set("ajax",        fs.element_exec({ constructor: ajax        }));
			node.child_set("localdata",   fs.element_exec({ constructor: local_data  }));
			node.child_set("breakpoint",  fs.element_exec({ constructor: breakpoint  }));/*}}}*/
			node.local = true;
		}(self.root.path_resolve_create('/usr/bin', 'dir')));

		return self;
	});

	fs.types = {
		'dir':  1,
		'exec': 2,
		'html': 3,
		'blob': 4,
		'file': 5
	};
	var element_generic = (function(argv, p) {
		var self = {};
		self.fs = argv.fs;
		self.local = false;
		self.has_local_content = (function() {
			return self.local;
		});
		self.updated = 0;
		self.type = (function() {
			return p.type;
		});
		self.name = (function() {
			return argv.name;
		});
		self.title = (function() {
			return argv.title || argv.name;
		});
		self.lessthan = (function(other) {
			return argv.name < other.name();
		});
		self.title = (function() {
			return self.path();
		});
		self.linkable = false;
		self.url = (function() {
			var node = self;
			var local_nodes = [];
			var append = "";

			// where default.html exists, have the directory root lead to it
			// and have index.html report the right url.
			if (self.is_html && self.name() == "default.html") {
				node = self.parent();
			} else if (
				self.is_dir &&
				self.children['default.html'] &&
				self.children['default.html'].is_html
			) {
				append = "index.html";
			}

			while (node && node.local) {
				local_nodes.push(node);
				node = node.parent();
			}

			if (!node) {
				console.log("no non-local nodes in the FS tree. This should never happen.");
				throw new Error;
			}

			var url = node.fs.chroot + node.path();
			var count = local_nodes.length;

			if (count) {
				url += '#.';
				while (count--) {
					url += '/' + local_nodes[count].name();
				}
			}

			if (append)
				url += append;

			return url;
		});
		self.mime = (function() {
			return "unknown";
		});
		p.serialise_generic = (function() {
			var ret = {
				local: self.local,
			};
			switch (p.type) {
			  case fs.types.dir:
				ret.type= 'dir';
				break;
			  case fs.types.exec:
				ret.type= 'exec';
				break;
			  case fs.types.html:
				ret.type= 'html';
				break;
			}
			if (self.updated) ret.updated = self.updated;
			return ret;
		});
		self.parent = (function() {
			return p.parent;
		});
		p.parent = p.parent || argv.parent || null;
		self.path = (function() {
			return self.parent().path() + self.name();
		});

		argv.name = argv.name || '';

		self.update_ajax = (function(callback) {
			ao.state_machine({ states: {
				ajax_request: function(sm) {
					var uri = self.url();

					// if the last char is a /, this is a directory.
					// if theres no '.' after the last '/', this is probably a directory
					// if the end of uri is .html, this is a html document and we should request the json version
					var append = "";
					if (
						uri[uri.length-1] == '/'
					) {
						append = "default_ajax_action.json";
					} else if (uri.lastIndexOf('/') > uri.lastIndexOf('.')) {
						append = "/default_ajax_action.json";
					} else if (/index.html$/.test(uri)) {
						append = "/default_ajax_action.json";
						uri = uri.substr(0, uri.length - 10);
					} else if (/.html$/.test(uri)) {
						append = ".json";
					}

					sm.xhr = new XMLHttpRequest();
					sm.xhr.open('GET', encodeURI(uri + append));
					sm.xhr.setRequestHeader("X-Requested-With", "xmlhttprequest");
					sm.xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
					sm.xhr.onload = sm;
					sm.xhr.send();
					return sm.yield("ajax_update");
				},

				ajax_update: function(sm) {
					sm.success = false;
					switch (sm.xhr.status) {
					  case 404: // deleted node.
						// delete the parent node's reference to this node.
						delete self.parent().children[self.name()];
						break;

					  case 200: // Ok.
						var index = JSON.parse(sm.xhr.responseText);
						console.log(index);
						self.apply_update_recursive(index);
						self.fs.save();
						sm.success = true;
						break;
					  default:
						console.error("Received an unknown status from the server. ", xm.xhr);
						sm.node = null;
						break;
					}
					return sm.fnc.continue("run_callbacks");
				},

				run_callbacks: function(sm) {
					callback(sm.success);
					return sm.yield("resolve_known");
				}

			}})();
		});

		p.apply_update_generic = (function(update) {
			self.local = (true == update.local);

			if (update.complete) {
				self.updated = Date.now();
			}
		});

		// attach this to the onclick events of items that lead to this node
		self.event_click = (function(e) {
			e = e || window.event;
			window.setTimeout(function() {
				if (!self.local && self.updated + self.fs.expires < Date.now()) {
					self.update_ajax(function(success) {
						if (success) {
							if (
								self.is_dir &&
								self.children['default.html'] &&
								self.children['default.html'].is_html
							) {
								g.page.node_change(self.children['default.html']);
							} else {
								g.page.node_change(self);
							}
						} else {
						// the ajax failed so perform the default link action
							window.location = self.fs.chroot + self.pwd();
						}
					});
				} else {
					g.page.node_change(self);
				}
			}, 0);
			e.preventDefault();
			e.stopPropagation();
			return false;
		});

		// virtual functions
		self.apply_update_recursive = null;
		self.serialise = null;

		return self;
	});
	fs.element_exec = (function(argv, p) {
		argv = argv || {};
		p = p || {};
		p.type = fs.types.exec;

		var self = element_generic(argv, p);
		self.is_exec = true;
		self.local = true;

		self.create = (function() {
			return argv.constructor;
		});

		self.mime = (function() {
			return "Executable/Javascript";
		});

		return self;
	});
	fs.element_html = (function(argv, p) {
		argv = argv || {};
		p = p || {};
		p.type = fs.types.html;

		var self = element_generic(argv, p);

		self.is_html = true;
		self.linkable = true;
		self.body;
		p.js_str = "(void)0;";

		self.apply_update_recursive = (function(update) {
			if (update.type != 'html') return;

			if (update.data == 'dom') {
				window.setTimeout(function() {
					// need to delay until the page object is created.
					self.body = g.page.content_get();
				}, 0);
			} else {
				self.body   = update.body;
				self.pagetitle = update.title;
			}

			p.apply_update_generic(update);
		});

		self.mime = (function() {
			return "text/html";
		});

		self.title = (function() {
			return self.pagetitle;
		});

		self.gen_page = (function() {
			return self.body;
		});

		return self;
	});
	fs.element_blob = (function(argv, p) {
		argv = argv || {};
		p = p || {};
		p.type = fs.types.blob;

		var self = element_generic(argv, p);
		self.is_blob = true;
		self.local = true;

		self.url = (function() {
			return argv.url;
		});

		self.mime = (function() {
			return argv.mime;
		});

		return self;
	});
	fs.element_file = (function(argv, p) {
		argv = argv || {};
		p = p || {};
		p.type = fs.types.file;
		p.mime = argv.mime || "UNKNOWN";

		p.mime_viewable = [
			"text/plain",
			"image/png",
			"image/jpeg",
			"image/svg+xml"
		];

		var self = element_generic(argv, p);

		self.linkable = true;
		self.is_file  = true;
		self.realpath = (function() {
			return argv.realpath;
		});

		self.apply_update_recursive = (function(update) {
			if (update.type != 'file') return;

			p.mime = update.mime;
			p.apply_update_generic(update);

			if (ao.array_contains(p.mime_viewable, update.mime)) {
				self.local = true;
			}
		});

		self.mime = (function() {
			return p.mime;
		});

		self.gen_page = (function() {
			var frag = document.createDocumentFragment();

			switch (self.mime()) {
			  case "image/png":
			  case "image/jpeg":
			  case "image/svg+xml":
				var imgid = "img" + Math.floor(Math.random()*1000000);

				frag.appendChild(ao.dom_node('div', {
					appendChild: [
						ao.dom_node('input', {
							type: 'checkbox',
							id: imgid,
							name: imgid,
							className: "hidden"
						}),
						ao.dom_node('label', {
							appendChild: ao.dom_node('img', {
								src: self.realpath()
							}),
							"htmlFor": imgid
						})
					],
					className: "scaling_image"
				}));
				break;

			  case "image/svg+xml":
				// the file will have to be downloaded at some point
				break;
			}
			return frag;
		});

		return self;
	});
	fs.node = (function(argv, p) { // element_dir
		argv     = argv || {};
		p        = p    || {};
		p.type = fs.types.dir;
		var self = element_generic(argv, p);
		self.is_dir = true;
		self.linkable = true;

		self.mime = (function() {
			return "Directory";
		});

		self.children = {};

		self.children['.'] = self;
		if (argv.parent) {
			self.children['..'] = argv.parent;
		}

		p.node_class = argv.node_class;

		self.parent_get = (function() {
			return self.children['..'] || null;
		});

		self.title = (function() {
			return "Index of " + node.pwd();
		});

		var path_resolve_common = (function(path, on_notfound = undefined) {
			var node = self;
			path = decodeURI(path).split('/');
			if (path[0] == '') {
				node = node.fs.root;
			}
			for (var i = 0, l = path.length ; i < l ; ++i) {
				if (path[i] == '') continue;
				if (node.children[path[i]]) {
					node = node.children[path[i]];
				} else {
					if (on_notfound) {
						node = on_notfound(node, path, i);
						if (!node) return
					} else {
						return;
					}
				}
			}
			return node;
		});
		self.path_resolve = (function(path) {
			return path_resolve_common(path);
		});
		self.path_resolve_create = (function(path, type) {
			return path_resolve_common(path, function(node, path_arr, i) {
				if (i + 1 < path_arr.length) {
					return node.mkdir(path_arr[i]);
				} else {
					switch (type) {
					  case "dir":
					  case "directory":
						return node.mkdir(path_arr[i])
					  case "html":
					  case "text/html":
						return self.children[path_arr[i]] = fs.element_html({
							parent: self,
							name: path_arr[i],
							fs: self.fs
						});
					  case "file":
						return self.children[path_arr[i]] = fs.element_file({
							parent: self,
							name: path_arr[i],
							fs: self.fs
						});
					  default:
						return null;
					}
				}
			});
		});
		self.path_resolve_ajax = (function(path, callback, force) {
			force = (force == true);

			ao.state_machine({ states: {
				resolve_known: function(sm) {
					sm.node = self;
					sm.path = path.split('/');
					if (sm.path[0] == '') {
						sm.node = sm.node.fs.root;
					}
					while (sm.path.length) {
						if (sm.path[0] != '') {
							if (sm.node.children[sm.path[0]]) {
								sm.node = sm.node.children[sm.path[0]];
							} else {
								// goto ajaxy part
								console.log(sm.path);
								sm.handler = "ajax_create";
								return sm.continue("ajax_request");
							}
						}
						sm.path.shift();
					}
					// arrived at destination;
					if (!sm.node.local && (
						force ||
						sm.node.updated + sm.node.fs.expires < Date.now()
					)) {
						sm.handler = "ajax_update";
						return sm.continue("ajax_request");
					}

					// the calling function expects to complete before the callbacks are called.
					window.setTimeout(sm, 0);
					return sm.yield("run_callbacks");
				},

				ajax_request: function(sm) {
					var uri = sm.node.url();
					if (sm.path.length) {
						uri += sm.path.join('/');
					}

					// if the last char is a /, this is a directory.
					// if theres no '.' after the last '/', this is probably a directory
					// if the end of uri is .html, this is a html document and we should request the json version
					var append = "";
					if (
						uri[uri.length-1] == '/'
					) {
						append = force ? "index.html.json" : "default_ajax_action.json";
					} else if (uri.lastIndexOf('/') > uri.lastIndexOf('.')) {
						append = force ? "/index.html.json" : "/default_ajax_action.json";
					} else if (/.html$/.test(uri)) {
						append = ".json";
					}

					sm.xhr = new XMLHttpRequest();
					sm.xhr.open('GET', encodeURI(uri + append));
					sm.xhr.setRequestHeader("X-Requested-With", "xmlhttprequest");
					sm.xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
					sm.xhr.onload = sm;
					sm.xhr.send();
					return sm.yield(sm.handler);
				},

				ajax_update: function(sm) {
					switch (sm.xhr.status) {
					  case 404: // deleted node.
						// delete the parent node's reference to this node.
						delete sm.node.children[".."].children[sm.node.name()];
						sm.node = null;
						break;

					  case 200: // Ok.
						try {
							var update = JSON.parse(sm.xhr.responseText);
							console.log(update);
							sm.node.apply_update_recursive(update);
						} catch (e) {
							console.error(
								"A resource exists on the server but the resource did not return json."
							);
						}
						break;
					  default:
						console.error("Received an unknown status from the server. ", xm.xhr);
						sm.node = null;
						break;
					}
					return sm.fnc.continue("save_changes");
				},

				ajax_create: function(sm) {
					switch (sm.xhr.status) {
					  case 404: // node doesnt exist.
						sm.node = null;
						return sm.fnc.continue("run_callbacks");
						break;

					  case 200: // Ok.
						// create all the imcomplete directories up to the new data.
						for (var i = 0, l = sm.path.length ; i < l-1 ; ++i) {
							if (sm.path[i]) sm.node = sm.node.mkdir(sm.path[i]);
						}
						var name = sm.path[sm.path.length - 1];
						try {
							var update = JSON.parse(sm.xhr.responseText);
							sm.node = sm.node.apply_update_as_child(name, update);
						} catch (e) {
							// the server didnt reply with json. this must be a file!
							sm.node = sm.node.children[sm.path[0]] = fs.element_file({
								parent: self,
								name: sm.path[0],
								mime: sm.xhr.getResponseHeader("Content-Type"),
								realpath: "",
								fs: self.fs
							});
						}
						break;

					  default:
						console.error("Received an unknown status from the server. ", xm.xhr);
						sm.node = null;
						break;
					}
					return sm.fnc.continue("save_changes");
				},

				save_changes: function(sm) {
					sm.node.fs.save();
					return sm.fnc.continue("run_callbacks");
				},

				run_callbacks: function(sm) {
					callback(sm.node);
					return sm.yield("resolve_known");
				}
			}})();
		});


		self.apply_update_as_child = (function(name, update) {
			switch (update.type) {
			  case "dir":
				self.mkdir(name);
				break;
			  case "html":
				self.children[name] = fs.element_html({
					parent: self,
					name: name,
					fs: self.fs
				});
				break;
			  case "file":
				self.children[name] = fs.element_file({
					parent: self,
					name: name,
					realpath: self.fs.chroot + self.path() + name,
					fs: self.fs
				});
				break;
			  default:
				console.error(update.type + ": unhandled type");
				return self.children[name];
				break;
			}
			self.children[name].apply_update_recursive(update);
			return self.children[name];
		});
		self.apply_update_recursive = (function(update) {
			if (update.type != "dir") {
				if (update.type == "html") {
					if (!self.children['default.html']) {
						self.children['default.html'] = fs.element_html({
							parent: self,
							name: 'default.html',
							fs: self.fs
						});
					}
					self.children['default.html'].apply_update_recursive(update);
				}
				return;
			}
			var c_keys = ao.object_get_keys(self.children);
			if (update.children) {
				for (var child in update.children) {
					if (!self.children[child]) {
						self.apply_update_as_child(child, update.children[child]);
					} else {
						self.children[child].apply_update_recursive(update.children[child]);
					}

					// remove this key from the list of children to be deleted.
					var child_i = ao.array_index_of(c_keys, child);
					if (child_i >= 0) delete c_keys[child_i];
				}

				// delete the directories that exist, werent sent by the server, and arent local
				if (update.complete) {
					for (var i = 0, l = c_keys.length ; i < l ; ++i) {
						if (
							!c_keys[i]         ||
							c_keys[i] == '.'   ||
							c_keys[i] == '..'  ||
							self.children[c_keys[i]].local
						) {
							continue;
						}
						delete self.children[c_keys[i]];
					}
				}
				p.apply_update_generic(update);
			}
		});

		self.parent = (function() {
			return self.children['..'];
		});
		self.path = (function() {
			var node = self;
			var path = '';
			do {
				path = node.name() + '/' + path;
				node = node.parent_get();
			} while (node);
			return path;
		});
		self.pwd = self.path;


		self.mkdir = (function(name, constructor) {
			constructor = constructor || p.node_class;
			if (self.child_exists(name)) return false;
			self.children[name] = constructor({
				fs: self.fs,
				node_class: constructor,
				name: name,
				parent: self,
			});
			return self.children[name];
		});

		self.title = (function() {
			return "Index of " + argv.name;
		});

		self.child_exists = (function(name) {
			return self.children[name] != null;
		});
		self.child_set = (function(name, value) {
			if (self.children[name]) return false;
			self.children[name] = value;
			return true;
		});
		self.child_get = (function(name) {
			return self.children[name];
		});
		self.child_remove = (function(name) {
			var ret = self.children[name];
			delete self.children[name];
			return ret;
		});

		self.has_local_content = (function() {
			if (self.local) return true;

			for (var dir in self.children) {
				if (self.children[dir].local) return true;
			}

			return false;
		});
		self.serialise = (function() {
			var ret = p.serialise_generic();

			var children = {};
			var append = false;
			for (var index in self.children) {
				if (
					index == '.' || index == '..'
					|| !self.children[index].serialise
				) continue;
				children[index] = self.children[index].serialise();
				append = true;
			}
			if (append) ret.children = children;

			return ret;
		});

		self.gen_page = (function() {
			var frag = document.createDocumentFragment();

			var build_breadcrumb_recursive = function(node, append) {
				if (node.children['..']) {
					build_breadcrumb_recursive(node.children['..'], append);
				}
				append.appendChild(ao.dom_node('a', {
					href:     node.url(),
					text:     node.name() + '/',
					onclick:  node.event_click
				}));
			};

			var title = ao.dom_node('h1', {
				text: "Index of "
			});
			build_breadcrumb_recursive(self, title);
			frag.appendChild(title);

			// generate a generic table row
			var row = (function(a) {
				var content;
				if (a.url) {
					content = ao.dom_node('a', {
						text: a.title,
						href: a.url,
						onclick: a.onclick,
						data: {
							path: a.path
						}
					});
				} else {
					content = document.createTextNode(a.title);
				}

				return ao.dom_node('tr', { appendChild: [
					ao.dom_node('td', { appendChild: ao.dom_node('img', {
						src: a.icon_src,
						alt: a.icon_alt,
					})}),
					ao.dom_node('td', {
						appendChild: content
					}),
					ao.dom_node('td', {
						text: a.type || 'unknown'
					}),
				] });
			});

			var table = ao.dom_node('table');

			if (self.children['..']) {
				var n = self.children['..'];
				table.appendChild(row({
					icon_src: '/usr/share/icons/back.png',
					icon_alt: '[PARENTDIR]',
					title: 'Parent Directory',
					url: n.url(),
					onclick: n.event_click,
					path: n.pwd(),
					type: 'Directory'
				}));
			}

			// so directories will be processed first.
			var keys = Object.keys(self.children).sort(function(a,b) {
				if (self.children[a].type() == fs.types.dir) {
					if (self.children[b].type() != fs.types.dir) {
						return false;
					}
				} else if (self.children[b].type() == fs.types.dir) {
					return true;
				}
				return a > b;
			});
			for (var i = 0, l = keys.length ; i < l ; ++i) {
				if (keys[i].startsWith('.')) continue;
				var child = self.children[keys[i]];

				switch (child.type()) {
				  case fs.types.dir:
					table.appendChild(row({
						icon_src: '/usr/share/icons/dir.png',
						icon_alt: '[DIR]',
						title: child.name(),
						url: child.url(),
						onclick: child.event_click,
						path: child.path(),
						type: child.mime()
					}));
					break;

				  case fs.types.exec:
					table.appendChild(row({
						icon_src: '/usr/share/icons/binary.png',
						icon_alt: '[JS]',
						title: keys[i],
						type: child.mime()
					}));
					break;

				  case fs.types.html:
					table.appendChild(row({
						icon_src: '/usr/share/icons/layout.png',
						icon_alt: '[HTML]',
						title: keys[i],
						url: child.url(),
						onclick: child.event_click,
						path: null,
						type: child.mime()
					}));
					break;

				  case fs.types.blob:
					table.appendChild(row({
						icon_src: '/usr/share/icons/binary.png',
						icon_alt: '[FILE]',
						title: keys[i],
						url: child.url(),
						path: null,
						type: child.mime()
					}));
					break;

				  case fs.types.file:
					table.appendChild(row({
						icon_src: '/usr/share/icons/binary.png',
						icon_alt: '[FILE]',
						title: keys[i],
						url: child.url(),
						onclick: child.event_click,
						path: null,
						type: child.mime()
					}));
					break;

				  default:
					table.appendChild(row({
						icon_src: '/usr/share/icons/binary.png',
						icon_alt: '[NULL]',
						title: keys[i],
						type: child.mime()
					}));
					break;
				}
			}

			frag.appendChild(table)

			return frag;
		});

		return self;
	});

	var shell = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = ao.shell(argv, p);

		p.fs = p.fs || argv.fs || argv.pwd.fs;
		p.pwd = argv.pwd || p.fs.root;

		argv.hostname = argv.hostname || "localhost";
		p.env['PATH'] = argv.path || '/bin/:/usr/bin/';

		self.prompt = (function() {
			var user = argv.username ? argv.username + "@" : "";
			return ao.dom_node('span', {
				className: 'robjh_prompt',
				text: '['+user+argv.hostname+':'+self.pwd()+']$ '
			});
		});
		p.cmd_get = (function(identifier) {
			if (identifier[0] == '.' || identifier[0] == '/') {
				var node = p.pwd.path_resolve(identifier);
				if (node && node.is_exec)
					return node.create();
			} else {
				var path = p.env['PATH'].split(':');
				for (var i = 0, l = path.length ; i < l ; ++i) {
					var node = p.pwd.path_resolve(path[i]);
					var exec = node.child_get(identifier);
					if (exec && exec.is_exec)
						return exec.create();
				}
			}
		});
		self.pwd = (function() {
			return p.pwd.pwd();
		});
		self.pwdnode = p.pwd;
		self.cd = (function(path) {
			var node = p.pwd.path_resolve(path);
			if (node) {
				p.pwd = node;
				return node;
			}
			return null;
		});
		self.cd_ajax = (function(path, callback, index) {
			p.pwd.path_resolve_ajax(path, function(node) {
				if (node) {
					if (node.is_dir) {
						p.pwd = node;
						callback(node, self.cd_ajax.result.ok);
					} else {
						callback(null, self.cd_ajax.result.not_dir);
					}
				} else {
					callback(null, self.cd_ajax.result.not_found);
				}
			}, index);
		});
		self.cd_ajax.result = {
			ok: 0,
			not_found: 1,
			not_dir: 2,
		};

		p.go_to_node = (function(node) {
			p.pwd = node.is_dir ? node : node.parent();
			if (argv.term.backlog_get) {
				var user = argv.username ? argv.username + "@" : "";
				var prompt = argv.term.backlog_get().lastChild;
				if (prompt.className == "robjh_prompt") {
					prompt.innerHTML = '['+user+argv.hostname+':'+self.pwd()+']$ ';
				}
			}
		});

		if (g.page)
			g.page.callback_url_update_register(p.go_to_node);

		var super_populate_process_argv = p.populate_process_argv;
		p.populate_process_argv = (function(argv) {
			argv = super_populate_process_argv(argv);
			argv.pwd = argv.pwd || p.pwd;
			return argv;
		});

		return self;
	});

	// this object is reponsible for changing the contents of the page and managing the url.
	var page = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = {};

		if (argv.global) {
			g.page = self;
		}

		p.container = p.container || argv.container;
		p.callbacks_url_change = p.callbacks_url_change || {};
		p.current_layout = 'index'; // its probably an index page

		self.set_this_global = (function() {
			g.page = self;
		});

		self.fix_initial_history = (function(node) {
			self.node = node;
			history.replaceState(node.path(), node.title(), node.url());
		});

		var token_generator = 0;
		p.new_token = (function() {
			return token_generator++;
		});


		self.callback_url_update_register = (function(callback) {
			var token = p.new_token();
			p.callbacks_url_change[token] = callback;
			return token;
		});
		self.callback_url_update_remove = (function(token) {
			delete p.callbacks_url_change[token];
		});
		p.callback_url_update_exec = (function(node) {
			for (var callback in p.callbacks_url_change) {
				p.callbacks_url_change[callback](node);
			}
		});

		p.onpopstate = (function(event) {
			if (!event.state) return;

			self.node = argv.fs.root.path_resolve(event.state);
			var content = self.node.gen_page();

			self.content_replace(content);
			p.callback_url_update_exec(self.node);
		});
		if (argv.global) {
			window.onpopstate = p.onpopstate;
		}

		self.content_replace = (function(new_content) {
			p.container.innerHTML = "";
			if (typeof new_content==="string") {
				p.container.innerHTML = new_content;
			} else {
				p.container.appendChild(new_content);
			}
		});

		self.content_get = (function() {
			return p.container.innerHTML;
		});

		/**
		 *	updates the page contents, and pushes a new url to the browser history.
		 */
		self.dir_change = (function(node, force_index, stayput) {
			force_index = (force_index == true);

			self.node = node;

			if (!stayput) {
				history.pushState(node.pwd(), node.title(), node.url());
				p.callback_url_update_exec(node);
			}

			self.content_replace(p.gen_index_page(node));
		});

		self.dir_change_inplace = (function(node) {
			self.node = node;
			self.content_replace(p.gen_index_page(node));
			history.replaceState(node.pwd(), node.title(), node.url());
		});

		self.node_change = (function(node) {

			self.node = node;
			var content = node.gen_page();
			content = self.node.gen_page();

			document.title = node.title();
			history.pushState(node.path(), node.title(), node.url());
			self.content_replace(content);
			p.callback_url_update_exec(node);
		});

		self.node_change_inplace = (function(node) {
			self.node = node;
			var content = node.gen_page();
			self.content_replace(content);
			document.title = node.title();
			history.replaceState(node.path(), node.title(), node.url());
		});

		self.reload = (function() {
			if (p.current_layout = 'index') {
				self.content_replace(self.node.gen_page());
			}
		});

		return self;
	});

	rob.fs = fs;
	rob.shell = shell;
	rob.page = page;

	return rob;
})();
