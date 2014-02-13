/**
 * Media viewr plugin for jQuery
 * version 1.0.0
 * Kane Cohen [KaneCohen@gmail.com] | https://github.com/KaneCohen | https://github.com/KaneCohen/exposer
 * @preserve
 */
(function(factory) {
	if (typeof define === 'function' && define.amd) {
		define(['jquery'], factory);
	} else {
		factory(jQuery);
	}
}(function($) {

	'use strict';

	$.fn.exposer = function(options) {
		var exp = null, args = arguments;
		var o = $.extend({}, options);
		o.selector = this.selector;
		o.element = $(document);

		exp = o.element.data('exposer');
		if (exp != undefined && exp[o.selector] != undefined) {
			exp = exp[o.selector];
			exp.trigger.apply(exp, args);
		} else {
			exp = new Exposer(o);
		}
		return this;
	};

	function guid() {
		return (((1+Math.random())*0x10000)|0).toString(16)+
			(((1+Math.random())*0x10000)|0).toString(16);
	};

	var defaultOptions = {
		hideOnOverlayClick: true,
		preload: 1,  // How many images to load before/ahead of the current active image.
		callbacks: {}
	};
	var defaultVars = {
		dimTimer:    null,
		clickItem:   null,
		activeItem:  null,
		items: [],
		extensions: ['jpg', 'jpeg', 'png', 'gif', 'tiff', 'bmp'],
		videoProviders: {
			youtube: {
				regex: [
					'(?:www\\.)?youtu\\.be\\/([0-9a-zA-Z-_]{11})',
					'^(?:https?:\\/\\/)?(?:www\\.)?(?:youtu\\.be\\/|youtube\\.com\\/(?:embed\\/|v\\/|watch\\?v=|watch\\?.+&v=))((\\w|-){11})(?:\\S+)?$'
				],
				attributes: {
					src: 'http://www.youtube.com/embed/{1}?rel=0',
					width:  854,
					height: 510,
					allowfullscreen: null,
					frameborder: 0
				}
			},
			vimeo: {
				regex: [
					'(?:http:\/\/)?(?:www\.)?vimeo\.com\/([0-9])'
				],
				attributes: {
					src: 'http://player.vimeo.com/video/{1}',
					width:  854,
					height: 510,
					allowfullscreen: null,
					frameborder: 0
				}
			}
		}
	};

	function Exposer(o) {
		this.o = $.extend(true, {}, defaultOptions, o);
		this.v = $.extend(true, {}, defaultVars);
		this.init(o);
	}

	Exposer.prototype = {
		o: {},
		v: {},
		html: {
			exposer: '<div id="exposer"></div>',
			header:    '<div class="header"><span class="close"></span></div>',
			content:   '<div class="content"><a href="#" class="prev-container">' +
				'<span class="prev"></span></a><a href="#" class="next-container">' +
				'<span class="next"></span></a></div>',
			list:      '<ul class="items"></ul>',
			item:      '<li class="item"></li>',
			itemContainer:  '<div class="container"></div>',
			itemMeta:       '<div class="meta"></div>',
			footer:    '<div class="footer"></div>',
			spinner:   '<div class="spinner"></div>'
		},

		init: function() {
			this.o.id = guid();
			this.initCallbacks();
			this.initEvents();

			var exposer = this.o.element.data('exposer') || {};
			exposer[this.o.selector] = this;
			this.o.element.data('exposer', exposer);
			return this;
		},

		initEvents: function() {
			var self = this;
			var o = this.o;
			o.element.on('click.'+o.id+' touchend.'+o.id, o.selector, function(e) {
				if (self.validateItem(this.href)) {
					self.v.clickItem = $(this);
					self.show(e, $(this));
					e.stopPropagation();
					e.preventDefault();
					return false;
				}
			});
		},

		initListeners: function() {
			var self = this;
			$(window).off('resize.exposer');
			$(document).off('.exposer');
			$(window).on('resize.exposer', function() {
				self.repositionItem(self.v.activeItem);
			});
			this.v.container.on('click.exposer', function(e) {
				if (e.target.classList.contains('close')
				    || (self.o.hideOnOverlayClick && e.target.id == 'exposer'))
				{
					self.hide();
					return false;
				}
			});

			this.v.container.on('click.exposer', '.prev-container, .next-container', function(e) {
				if ($(e.currentTarget).hasClass('prev-container')) {
					self.prev();
				} else {
					self.next();
				}
				e.stopPropagation();
				e.preventDefault();
				return false;
			});

			$(document).on('keydown.exposer', function(e) {
				setTimeout(function() {
					self.keyDown(e);
				}, 1);
			});

			var px = 0, py = 0;
			var x = null, y = null;
			var dimmed = false;
			$(document).on('mousemove.exposer', function(e) {
				x = e.clientX;
				y = e.clientY;
				if (dimmed) {
					self.v.container.removeClass('dim');
				}
			});
			self.v.dimTimer = setInterval(function() {
				if (px == x && py == y) {
					dimmed = true;
					self.v.container.addClass('dim');
				}
				px = x;
				py = y;
			}, 4000);
		},

		buildExposer: function() {
			$('#exposer').remove();
			this.v.container = $(this.html.exposer);
			this.v.header = $(this.html.header);
			this.v.content = $(this.html.content);
			this.v.list = $(this.html.list);
			this.v.content.append(this.v.list);
			this.v.footer = $(this.html.footer);
			this.v.spinner = $(this.html.spinner);
			this.v.container
				.append(this.v.header)
				.append(this.v.spinner)
				.append(this.v.content)
				.append(this.v.footer);
		},

		parsePage: function() {
			var self = this;
			var collectionId = this.v.clickItem.data('collection') || null;
			var itemDefault = {
				type:     null,
				el:       null,
				original: null,
				link:     null,
				size:     null,
				loaded:   false
			};
			if (collectionId) {
				var collection = $(this.o.selector).filter('[data-collection="'+collectionId+'"]');
				if (collection.length >= 1) {
					// First pass to find active item
					$.each(collection, function(k,v) {
						if (v == self.v.clickItem[0]) {
							self.v.activeItem = k;
						}
					});

					$.each(collection, function(k,v) {
						var item = $.extend({}, itemDefault);
						item.original = $(v);
						item.link = $(v).attr('href');
						self.v.items.push(item);
						self.buildItem(k);
					});
				}
			} else {
				var item = $.extend({}, itemDefault);
				this.v.activeItem = 0;
				item.original = this.v.clickItem;
				item.link = this.v.clickItem.attr('href');
				this.v.items.push(item);
				this.buildItem(0);
			}
		},

		validateItem: function(href) {
			return this.getContentType(href) ? true : false;
		},

		show: function(e, el) {
			// Detect what type of content are we trying to load
			var st = $(document).scrollTop();
			var sl = $(document).scrollLeft();
			$('body').css({overflow: 'hidden'})
				.scrollTop(st)
				.scrollLeft(sl);
			this.buildExposer(el);
			this.parsePage();
			$('body').append(this.v.container);
			this.refreshControls();
			this.initListeners();
		},

		hide: function() {
			$('body').css({overflow: ''});
			this.v.container.remove();
			clearInterval(this.v.dimTimer);
			this.o.element.off('.exposer');
			this.v = $.extend(true, {}, defaultVars);
		},

		preload: function() {
			var self = this;
			$.each(this.v.items, function(key,item) {
				if (key >= self.v.activeItem - self.o.preload && key <= self.v.activeItem + self.o.preload && ! item.loaded) {
					self.buildContent(key);
				}
			});
		},

		refreshControls: function() {
			this.v.container.find('.prev-container').show();
			this.v.container.find('.next-container').show();
			if (this.v.activeItem === 0) {
				this.v.container.find('.prev-container').hide();
			}
			if (this.v.activeItem === this.v.items.length-1) {
				this.v.container.find('.next-container').hide();
			}
		},

		next: function() {
			if (this.v.activeItem < this.v.items.length-1) {
				this.v.activeItem++;
				this.preload();
				this.v.container.find('.active').removeClass('active');
				this.repositionItem(this.v.activeItem);
				this.v.items[this.v.activeItem].el.addClass('active');
				this.refreshControls();
			}
		},

		prev: function() {
			if (this.v.activeItem > 0) {
				this.v.activeItem--;
				this.preload();
				this.v.container.find('.active').removeClass('active');
				this.repositionItem(this.v.activeItem);
				this.v.items[this.v.activeItem].el.addClass('active');
				this.refreshControls();
			}
		},

		keyDown: function(e) {
			if (e.which == 37) {
				this.prev();
				e.preventDefault();
			} else if (e.which == 39) {
				this.next();
				e.preventDefault();
			} else if (e.which == 27) {
				this.hide();
				e.preventDefault();
			}
		},

		buildItem: function(key) {
			var item = this.v.items[key];
			if (item.loaded) {
				return;
			}
			var type = this.getContentType(this.v.items[key].link);
			if (type) {
				var container = $(this.html.itemContainer);
				var meta = $(this.html.itemMeta);
				item.el = $(this.html.item)
					.attr('data-key', key)
					.append(container)
					.append(meta);

				item.type = type;

				if (key >= this.v.activeItem - 1 && key <= this.v.activeItem + 1 && ! item.loaded) {
					this.buildContent(key);
				}

				this.v.list.append(item.el);
			}
		},

		buildContent: function(key) {
			var item = this.v.items[key];
			if (key == this.v.activeItem) {
				item.el.addClass('active loading');
			}
			var content = this['build'+this.upperCase(item.type)](key);
			if (content) {
				item.el.find('.container').append(content);
			}
			this.repositionItem(key);
		},

		buildImage: function(key) {
			var self = this;
			if (this.v.activeItem == key) this.v.spinner.show();
			var link = this.v.items[key].link;
			var image = new Image();
			var $image = $(image);

			image.onload = function() {
				if (self.v.activeItem == key) self.v.spinner.hide();
				var item = self.v.items[key];
				item.el.removeClass('loading');
				item.loaded = true;
				var size = {
					width: image.width,
					height: image.height,
					ratio: image.width/image.height
				};
				item.size = size;
				$image.addClass('image loaded');
				item.el.find('.container').html($(image));

				if (key == self.v.activeItem) {
					$image.addClass('fade');
					setTimeout(function() {
						$image.addClass('in');
					}, 1);
					setTimeout(function() {
						$image.removeClass('fade').removeClass('in');
					}, 401);
				}
				self.repositionItem(key);
			};
			image.src = link;
			return null;
		},

		buildVideo: function(key) {
			if (this.v.activeItem == key) this.v.spinner.hide();
			var item = this.v.items[key];
			item.loaded = true;
			var link = item.link;
			var iframe = $(document.createElement('iframe')).addClass('video');
			var provider = this.getVideo(link);
			$.each(provider, function(k,v) {
				iframe.attr(k,v);
			});
			item.size = {
				width: provider.width,
				height: provider.height,
				ratio: provider.width/provider.height
			};
			return iframe;
		},

		getContentType: function(href) {
			// Go through video providers and try each href agains regex
			var video = false;
			$.each(this.v.videoProviders, function(k,v) {
				$.each(v.regex, function(i,regStr) {
					var regex = new RegExp(regStr, 'i');
					if (href.match(regex)) {
						video = true;
						return;
					}
				});
				if (video) {
					return;
				}
			});
			if (video) {
				return 'video';
			}
			// Content either could be an image or a video
			var segments = href.split('.');
			var ext = segments[segments.length-1].split('?');
			if (this.v.extensions.indexOf(ext[0].toLowerCase()) != -1) {
				return 'image';
			}
			return null;
		},

		getVideo: function(link) {
			var provider = null;
			$.each(this.v.videoProviders, function(k,v) {
				var match = null;
				$.each(v.regex, function(i,regStr) {
					var regex = new RegExp(regStr, 'i');
					match = link.match(regex);
					if (match) {
						return false;
					}
				});
				if (match) {
					var items = match.splice(1);
					var attributes = $.extend({}, v.attributes);
					$.each(items, function(x, item) {
						x = x+1;
						$.each(attributes, function(i,attr) {
							if (attr !== null) {
								var regex = new RegExp('\\{(\\D+)?(' + x + ')([^}]+)?\\}', 'i');
								var attrMatch = new String(attr).match(regex);
								if (attrMatch) {
									var ai = attrMatch.splice(1);
									var replacement = (ai[0] || '') + item + (ai[2] || '');
									attributes[i] = new String(attr).replace(attrMatch[0], replacement);
								}
							}
						});
					});
					provider = attributes;
					return false;
				}
			});
			return provider;
		},

		repositionItem: function(key) {
			if (this.v.items[key].loaded && this.v.activeItem == key) {
				this.v.spinner.hide();
			}
			var w = window.innerWidth;
			var h = window.innerHeight;
			var item = this.v.items[key];
			var container = item.el.find('.container')[0];
			var size = item.size || null;
			if (! size) {
				return;
			}
			var css = {
				width: size.width < w ? size.width : w,
				height: size.height < h ? size.height : h
			};
			if (size.ratio >= 1) {
				css.height = css.width/size.ratio;
				if (size.width > w) {
					css.width = w;
					css.height = w/size.ratio;
				}
				if (css.height > h) {
					css.height = h;
					css.width = h*size.ratio;
				}
			} else {
				css.width = css.height*size.ratio;
				if (size.height > h) {
					css.height = h;
					css.width = h*size.ratio;
				}
				if (css.width > w) {
					css.width = w;
					css.height = w/size.ratio;
				}
			}
			container.style.width = css.width+'px';
			container.style.height = css.height+'px';
		},

		destroy: function() {
			this.o.element.off('click.'+this.o.id);
			var exposer = this.o.element.data('exposer');
			delete exposer[this.o.selector];
			this.o.element.data('exposer', exposer);
			clearInterval(this.v.dimTimer);
		},

		initCallbacks: function() {
			var self = this;
			$.each(this.o.callbacks, function(k) {
				self.o.callbacks[k] = function() {
					var args = Array.prototype.slice.call(arguments);
					return self.o.element.triggerHandler(k, args);
				};
			});
		},

		trigger: function(name) {
			var args = Array.prototype.slice.call(arguments, 1);
			if (this.o.callbacks[name]) {
				if (this.o.callbacks[name].apply(this, args) === false)
					return false;
			}
			if (this[name]) {
				if (this[name].apply(this, args) === false)
					return false;
			}
			return true;
		},

		upperCase: function(string) {
			return string.toLowerCase().replace(/\b[a-z]/g, function(letter) {
				return letter.toUpperCase();
			});
		}
	};
}));
