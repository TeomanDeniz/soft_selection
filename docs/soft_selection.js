/******************************************************************************\
# JS - soft_selection                            #       Maximum Tension       #
################################################################################
#                                                #      -__            __-     #
# Teoman Deniz                                   #  :    :!1!-_    _-!1!:    : #
# maximum-tension.com                            #  ::                      :: #
#                                                #  :!:    : :: : :  :  ::::!: #
# +.....................++.....................+ #   :!:: :!:!1:!:!::1:::!!!:  #
# : C - Maximum Tension :: Create - 2025/01/14 : #   ::!::!!1001010!:!11!!::   #
# :---------------------::---------------------: #   :!1!!11000000000011!!:    #
# : License - MIT       :: Update - 2026/09/18 : #    ::::!!!1!!1!!!1!!!::     #
# +.....................++.....................+ #       ::::!::!:::!::::      #
\******************************************************************************/

/*
** Draws soft, gooey selection highlights behind text inside [data-selection]
** elements. Follows scrolling containers, clipping, and any 2D transform
** (move, scale, rotate, skew).
**
** Works as a classic <script> (creates the global `soft_selection`), and can
** be imported as an ES module through `soft_selection.mjs`.
*/

(
	function (global_object)
	{
		"use strict";

		const	DEFAULT_COLOR = "#E84A8C";
		const	GOO_DEFAULTS = {blur: 2, sharpness: 18, threshold: -4};
		const	INSTANT_CLASS = "soft_selection_instant";
		const	CULL_SCREENS = 1;
		const	ROOT_CONTEXT = Object.freeze({frame: null, clippers: [], scroll_x: 0, scroll_y: 0, key: "-"});

		let		instance_count = 0;

		function
			to_css_color(color)
		{
			if (typeof(color) === "number")
				return ("#" + color.toString(16).padStart(6, "0"));

			return (String(color || DEFAULT_COLOR));
		}

		function
			parent_of(element)
		{
			if (element.parentElement)
				return (element.parentElement);

			const	node = element.parentNode;

			return (node && node.host ? node.host : null);
		}

		function
			set_style(element, property, value)
		{
			const	cache = element.soft_selection_style || (element.soft_selection_style = {});

			if (cache[property] !== value)
			{
				cache[property] = value;
				element.style[property] = value;
			}
		}

		function
			rotate_matrix(value)
		{
			const	parts = value.trim().split(/\s+/);

			if (parts.length === 1)
				return (new DOMMatrix("rotate(" + parts[0] + ")"));

			if (parts.length === 2)
			{
				const	axis = {x: "1,0,0", y: "0,1,0", z: "0,0,1"}[parts[0]];

				return (new DOMMatrix("rotate3d(" + (axis || "0,0,1") + "," + parts[1] + ")"));
			}

			return (new DOMMatrix("rotate3d(" + parts.join(",") + ")"));
		}

		function
			scale_matrix(value)
		{
			const	parts = value.trim().split(/\s+/);

			if (parts.length === 1)
				return (new DOMMatrix("scale(" + parts[0] + ")"));

			if (parts.length === 2)
				return (new DOMMatrix("scale(" + parts.join(",") + ")"));

			return (new DOMMatrix("scale3d(" + parts.join(",") + ")"));
		}

		function
			signed_area(points)
		{
			let	area = 0;

			for (let i = 0; i < points.length; ++i)
			{
				const	a = points[i];
				const	b = points[(i + 1) % points.length];

				area += a[0] * b[1] - b[0] * a[1];
			}

			return (area / 2);
		}

		function
			cross(ax, ay, bx, by)
		{
			return (ax * by - ay * bx);
		}

		function
			clip_convex(subject, clip)
		{
			const	orientation = signed_area(clip) >= 0 ? 1 : -1;
			let		output = subject;

			for (let i = 0; i < clip.length && output.length; ++i)
			{
				const	a = clip[i];
				const	b = clip[(i + 1) % clip.length];
				const	input = output;
				const	edge_x = b[0] - a[0];
				const	edge_y = b[1] - a[1];
				const	inside = function(p)
				{
					return (orientation * cross(edge_x, edge_y, p[0] - a[0], p[1] - a[1]) >= 0);
				};

				output = [];

				for (let j = 0; j < input.length; ++j)
				{
					const	p = input[j];
					const	q = input[(j + 1) % input.length];
					const	p_inside = inside(p);

					if (p_inside)
						output.push(p);

					if (p_inside !== inside(q))
					{
						const	t = (
							cross(edge_x, edge_y, a[0] - p[0], a[1] - p[1]) /
							cross(edge_x, edge_y, q[0] - p[0], q[1] - p[1])
						);

						output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
					}
				}
			}

			return (output);
		}

		function
			merge_lines(rects)
		{
			const	lines = [];

			rects.sort(function(p, q){return (p.y - q.y || p.x - q.x);});

			for (const	rect of rects)
			{
				let	target = null;

				for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; --i)
				{
					const	line = lines[i];
					const	overlap = Math.min(line.y + line.h, rect.y + rect.h) - Math.max(line.y, rect.y);
					const	gap = Math.max(line.h, rect.h);

					if (
						overlap > Math.min(line.h, rect.h) * 0.5 &&
						rect.x <= line.x + line.w + gap &&
						rect.x + rect.w >= line.x - gap
					)
					{
						target = line;
						break ;
					}
				}

				if (target)
				{
					const	right = Math.max(target.x + target.w, rect.x + rect.w);
					const	bottom = Math.max(target.y + target.h, rect.y + rect.h);

					target.x = Math.min(target.x, rect.x);
					target.y = Math.min(target.y, rect.y);
					target.w = right - target.x;
					target.h = bottom - target.y;
				}
				else
					lines.push({x: rect.x, y: rect.y, w: rect.w, h: rect.h});
			}

			return (lines);
		}

		let	active_instance = null;

		function
			start(options)
		{
			if (typeof(window) === "undefined" || typeof(document) === "undefined")
				throw (new Error("soft_selection: needs a browser"));

			options = options || {};

			if (active_instance)
				active_instance.stop();

			const	id = "soft_selection_" + (++instance_count);
			const	handlers = new Map(Object.entries(options.copy_handlers || {}));
			const	copy_duration = options.copy_duration >= 0 ? options.copy_duration : 300;
			const	hide_native = options.hide_native !== false;
			let		color = to_css_color(options.color);
			let		on_copy = typeof(options.on_copy) === "function" ? options.on_copy : null;
			let		goo = (
				options.goo === false ? null :
				{...GOO_DEFAULTS, ...(typeof(options.goo) === "object" ? options.goo : {})}
			);

			const	abort = new AbortController();
			const	listen = {signal: abort.signal, passive: true};
			const	measure = document.createRange();
			const	element_ids = new WeakMap();
			const	observed_roots = new WeakSet();

			let	running = true;
			let	overlay = null;
			let	overlay_created = false;
			let	style_element = null;
			let	filter_svg = null;
			let	resize_observer = null;
			let	mutation_observer = null;
			let	frame_id = 0;
			let	selection_changed = false;
			let	copy_timer = 0;
			let	next_element_id = 0;
			let	group_states = new Map();
			let	info_cache = null;
			let	context_cache = null;
			let	frame_cache = null;
			let	overlay_rect = null;

			function
				element_id(element)
			{
				let	value = element_ids.get(element);

				if (value === undefined)
				{
					value = ++next_element_id;
					element_ids.set(element, value);
				}

				return (value);
			}

			function
				resolve_container()
			{
				if (options.container instanceof Element)
					return (options.container);

				if (typeof(options.container) === "string")
					return (document.querySelector(options.container));

				return (document.getElementById("SELECTION_CONTAINER"));
			}

			function
				mount()
			{
				if (!running || overlay)
					return ;

				style_element = document.createElement("style");
				style_element.textContent = (
					":where(." + id + ") {" +
					 "position: absolute; top: 0; left: 0;" +
					 "width: 0; height: 0; overflow: visible;" +
					 "pointer-events: none; z-index: 0;" +
					"}" +
					"." + id + " .selection_group {" +
					 "position: absolute; top: 0; left: 0;" +
					 "width: 0; height: 0; transform-origin: 0 0;" +
					"}" +
					":where(." + id + " .selection_box) {" +
					 "position: absolute; box-sizing: border-box;" +
					"}" +
					"@media (prefers-reduced-motion: no-preference) {" +
					 ":where(." + id + " .selection_box) {" +
					  "transition: left 90ms ease-out, top 90ms ease-out," +
					  "width 90ms ease-out, height 90ms ease-out," +
					  "background-color 300ms;" +
					 "}" +
					"}" +
					"." + id + "." + INSTANT_CLASS + " .selection_box" +
					"{transition: none !important;}" +
					(
						hide_native ?
						":where([data-selection], [data-selection] *)::selection" +
						"{background-color: transparent;}" : ""
					)
				);
				document.head.appendChild(style_element);
				overlay = resolve_container();

				if (!overlay)
				{
					overlay = document.createElement("div");
					overlay_created = true;
					(document.body || document.documentElement).appendChild(overlay);
				}

				overlay.classList.add(id);
				overlay.setAttribute("aria-hidden", "true");
				apply_goo();

				if (window.ResizeObserver)
					resize_observer = new ResizeObserver(function(){request_render(false);});

				if (window.MutationObserver)
				{
					mutation_observer = new MutationObserver(on_mutation);
					mutation_observer.observe(
						document.documentElement,
						{subtree: true, childList: true, attributes: true, characterData: true}
					);
				}

				request_render(true);
			}

			function
				apply_goo()
			{
				if (filter_svg)
				{
					filter_svg.remove();
					filter_svg = null;
				}

				if (!overlay)
					return ;

				if (!goo)
				{
					overlay.style.filter = "";
					return ;
				}

				const	svg_ns = "http://www.w3.org/2000/svg";

				filter_svg = document.createElementNS(svg_ns, "svg");
				filter_svg.setAttribute("aria-hidden", "true");
				filter_svg.setAttribute("width", "0");
				filter_svg.setAttribute("height", "0");
				filter_svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
				filter_svg.innerHTML = (
					"<filter id='" + id + "_goo' filterUnits='userSpaceOnUse'" +
					" x='-20000' y='-20000' width='60000' height='200000'>" +
					"<feGaussianBlur in='SourceGraphic' stdDeviation='" +
					Number(goo.blur) + "' result='blur'/>" +
					"<feColorMatrix in='blur' mode='matrix' values='" +
					"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 " +
					Number(goo.sharpness) + " " + Number(goo.threshold) +
					"' result='goo'/>" +
					"<feComposite in='SourceGraphic' in2='goo' operator='atop'/>" +
					"</filter>"
				);
				(document.body || document.documentElement).appendChild(filter_svg);
				overlay.style.filter = "url(#" + id + "_goo)";
			}

			function
				element_info(element)
			{
				let	info = info_cache.get(element);

				if (info)
					return (info);

				const	computed = window.getComputedStyle(element);
				const	is_html = element instanceof HTMLElement;
				const	root = element === document.documentElement || element === document.body;

				info =
				{
					computed: computed,
					transformed: is_html && !root && (
						computed.transform !== "none" ||
						(computed.translate || "none") !== "none" ||
						(computed.rotate || "none") !== "none" ||
						(computed.scale || "none") !== "none"
					),
					clips: !root && (
						computed.overflowX !== "visible" ||
						computed.overflowY !== "visible" ||
						/paint|strict|content/.test(computed.contain || "")
					),
					fixed: computed.position === "fixed"
				};
				info_cache.set(element, info);
				return (info);
			}

			function
				context_of(element)
			{
				if (!element || element === document.documentElement || element === document.body)
					return (ROOT_CONTEXT);

				let	context = context_cache.get(element);

				if (context)
					return (context);

				const	outer = context_of(parent_of(element));
				const	info = element_info(element);
				let		frame = outer.frame;
				let		clippers = outer.clippers;
				let		scroll_x = outer.scroll_x;
				let		scroll_y = outer.scroll_y;

				if (info.fixed && !frame)
				{
					clippers = [];
					scroll_x = scroll_y = 0;
				}

				if (info.transformed)
				{
					frame = element;
					scroll_x = scroll_y = 0;
				}

				if (info.clips)
				{
					clippers = clippers.concat([element]);
					scroll_x += element.scrollLeft;
					scroll_y += element.scrollTop;
				}

				context =
				{
					frame: frame,
					clippers: clippers,
					scroll_x: scroll_x,
					scroll_y: scroll_y,
					key: (frame ? element_id(frame) : "-") + "|" + clippers.map(element_id).join(",")
				};
				context_cache.set(element, context);
				return (context);
			}

			function
				frame_of(element)
			{
				let	frame = frame_cache.get(element);

				if (frame !== undefined)
					return (frame);

				frame = null;

				const	computed = element_info(element).computed;
				let		linear = new DOMMatrix();

				try
				{
					if ((computed.rotate || "none") !== "none")
						linear = linear.multiply(rotate_matrix(computed.rotate));

					if ((computed.scale || "none") !== "none")
						linear = linear.multiply(scale_matrix(computed.scale));

					if (computed.transform !== "none")
						linear = linear.multiply(new DOMMatrix(computed.transform));
				}
				catch (error)
				{
					linear = new DOMMatrix();
				}

				const	outer = context_of(parent_of(element)).frame;
				const	outer_frame = outer ? frame_of(outer) : null;

				if (!outer || outer_frame)
				{
					if (outer_frame)
						linear = outer_frame.linear.multiply(linear);

					const	a = linear.a;
					const	b = linear.b;
					const	c = linear.c;
					const	d = linear.d;
					const	det = a * d - b * c;

					if (Math.abs(det) > 1e-9)
					{
						const	rect = element.getBoundingClientRect();
						const	half_w = element.offsetWidth / 2;
						const	half_h = element.offsetHeight / 2;

						frame =
						{
							linear: linear,
							a: a,
							b: b,
							c: c,
							d: d,
							det: det,
							e: rect.left + rect.width / 2 - (a * half_w + c * half_h),
							f: rect.top + rect.height / 2 - (b * half_w + d * half_h),
							axis: Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6
						};
					}
				}

				frame_cache.set(element, frame);
				return (frame);
			}

			function
				to_local(frame, rect, caret_height)
			{
				if (!frame)
				{
					return (
						{
							x: rect.left - overlay_rect.left,
							y: rect.top - overlay_rect.top,
							w: rect.width,
							h: rect.height
						}
					);
				}

				const	center_x = rect.left + rect.width / 2 - frame.e;
				const	center_y = rect.top + rect.height / 2 - frame.f;
				const	local_x = (frame.d * center_x - frame.c * center_y) / frame.det;
				const	local_y = (frame.a * center_y - frame.b * center_x) / frame.det;
				const	a = Math.abs(frame.a);
				const	b = Math.abs(frame.b);
				const	c = Math.abs(frame.c);
				const	d = Math.abs(frame.d);
				let		width;
				let		height;

				if (frame.axis)
				{
					width = rect.width / a;
					height = rect.height / d;
				}
				else
				{
					const	det = a * d - b * c;

					if (caret_height > 0)
						height = caret_height;
					else if (Math.abs(det) > 1e-3)
						height = (a * rect.height - b * rect.width) / det;
					else
						height = 0;

					width = a >= b ? (rect.width - c * height) / a : (rect.height - d * height) / b;
				}

				width = Math.max(0, width);
				height = Math.max(0, height);
				return ({x: local_x - width / 2, y: local_y - height / 2, w: width, h: height});
			}

			function
				clipper_quad(element)
			{
				const	frame_element = context_of(element).frame;
				const	rect = element.getBoundingClientRect();

				if (!frame_element)
				{
					const	x = rect.left + element.clientLeft;
					const	y = rect.top + element.clientTop;
					const	w = element.clientWidth;
					const	h = element.clientHeight;

					return ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
				}

				const	frame = frame_of(frame_element);

				if (!frame)
					return (null);

				let	x = element.clientLeft;
				let	y = element.clientTop;

				if (frame_element !== element)
				{
					const	center = to_local(frame, rect, 0);

					x += center.x + center.w / 2 - element.offsetWidth / 2;
					y += center.y + center.h / 2 - element.offsetHeight / 2;
				}

				const	w = element.clientWidth;
				const	h = element.clientHeight;

				return (
					[[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(
						function(p)
						{
							return (
								[
									frame.a * p[0] + frame.c * p[1] + frame.e,
									frame.b * p[0] + frame.d * p[1] + frame.f
								]
							);
						}
					)
				);
			}

			function
				clip_polygon(clippers)
			{
				if (!clippers.length)
					return (null);

				let	polygon = null;

				for (const	element of clippers)
				{
					const	quad = clipper_quad(element);

					if (!quad)
						return ([]);

					polygon = polygon ? clip_convex(polygon, quad) : quad;

					if (polygon.length < 3)
						return ([]);
				}

				return (
					polygon.map(
						function(p)
						{
							return ([p[0] - overlay_rect.left, p[1] - overlay_rect.top]);
						}
					)
				);
			}

			function
				color_of(root)
			{
				const	attribute = root.getAttribute("data-selection");

				if (attribute && attribute.trim())
					return (attribute.trim());

				const	variable = element_info(root).computed.getPropertyValue("--selection-color").trim();

				return (variable || color);
			}

			function
				collect_range(range, groups)
			{
				const	container = range.commonAncestorContainer;
				const	view_w = window.innerWidth;
				const	view_h = window.innerHeight;
				let		nodes;

				if (container.nodeType === Node.TEXT_NODE)
					nodes = [container];
				else
				{
					const	walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
					const	start = range.startContainer;

					nodes = [];
					walker.currentNode = (
						start.nodeType === Node.TEXT_NODE ? start :
						(start.childNodes[range.startOffset] || start)
					);

					if (walker.currentNode.nodeType === Node.TEXT_NODE)
						nodes.push(walker.currentNode);

					for (let node = walker.nextNode(); node; node = walker.nextNode())
					{
						if (range.comparePoint(node, 0) > 0)
							break ;

						nodes.push(node);
					}
				}

				for (const	node of nodes)
				{
					if (!node.data.length || !range.intersectsNode(node))
						continue ;

					const	parent = node.parentElement;
					const	root = parent && parent.closest("[data-selection]");

					if (!root || (overlay && overlay.contains(parent)))
						continue ;

					const	start = node === range.startContainer ? range.startOffset : 0;
					const	end = node === range.endContainer ? range.endOffset : node.data.length;

					if (end <= start)
						continue ;

					const	context = context_of(parent);
					const	frame = context.frame ? frame_of(context.frame) : null;

					if (context.frame && !frame)
						continue ;

					measure.setStart(node, start);
					measure.setEnd(node, end);

					const	rects = measure.getClientRects();

					if (!rects.length)
						continue ;

					let	caret_height = 0;

					if (frame && !frame.axis)
					{
						measure.collapse(true);

						const	caret = measure.getBoundingClientRect();

						caret_height = (
							Math.abs(frame.c) > Math.abs(frame.d) ?
							caret.width / Math.abs(frame.c) :
							caret.height / Math.abs(frame.d)
						);
					}

					let	group = groups.get(context.key);

					if (!group)
					{
						group = {context: context, frame: frame, roots: new Map()};
						groups.set(context.key, group);
					}

					let	list = group.roots.get(root);

					if (!list)
					{
						list = [];
						group.roots.set(root, list);

						if (resize_observer && !observed_roots.has(root))
						{
							observed_roots.add(root);
							resize_observer.observe(root);
						}
					}

					for (const	rect of rects)
					{
						if (
							rect.right < -view_w * CULL_SCREENS ||
							rect.left > view_w * (1 + CULL_SCREENS) ||
							rect.bottom < -view_h * CULL_SCREENS ||
							rect.top > view_h * (1 + CULL_SCREENS)
						)
							continue ;

						const	local = to_local(frame, rect, caret_height);

						if (local.w < 0.5 || local.h < 0.5)
							continue ;

						local.x += context.scroll_x;
						local.y += context.scroll_y;
						list.push(local);
					}
				}
			}

			function
				remove_group(state)
			{
				state.wrapper.remove();
			}

			function
				clear()
			{
				for (const	state of group_states.values())
					remove_group(state);

				group_states.clear();
			}

			function
				render()
			{
				frame_id = 0;

				const	instant = !selection_changed;
				const	selection = document.getSelection();

				selection_changed = false;

				if (!overlay || !running)
					return ;

				if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
				{
					clear();
					return ;
				}

				info_cache = new Map();
				context_cache = new Map();
				frame_cache = new Map();
				overlay.classList.toggle(INSTANT_CLASS, instant);
				overlay_rect = overlay.getBoundingClientRect();

				const	groups = new Map();

				for (let i = 0; i < selection.rangeCount; ++i)
					collect_range(selection.getRangeAt(i), groups);

				const	next_states = new Map();

				for (const	[key, group] of groups)
				{
					let	state = group_states.get(key);

					if (!state)
					{
						const	wrapper = document.createElement("div");
						const	inner = document.createElement("div");

						wrapper.className = "selection_group";
						inner.className = "selection_group";
						wrapper.appendChild(inner);
						overlay.appendChild(wrapper);
						state = {wrapper: wrapper, inner: inner, boxes: new Map()};
					}

					group_states.delete(key);
					next_states.set(key, state);

					const	context = group.context;
					const	frame = group.frame;
					const	polygon = clip_polygon(context.clippers);

					set_style(
						state.wrapper,
						"clipPath",
						!polygon ? "" :
						polygon.length < 3 ? "polygon(0 0, 0 0, 0 0)" :
						"polygon(" + polygon.map(function(p){return (p[0] + "px " + p[1] + "px");}).join(",") + ")"
					);
					set_style(
						state.inner,
						"transform",
						(
							frame ?
							"matrix(" + frame.a + "," + frame.b + "," + frame.c + "," + frame.d + "," +
							(frame.e - overlay_rect.left) + "," + (frame.f - overlay_rect.top) + ") " : ""
						) +
						"translate(" + (-context.scroll_x) + "px," + (-context.scroll_y) + "px)"
					);

					const	next_boxes = new Map();

					for (const	[root, rects] of group.roots)
					{
						const	lines = merge_lines(rects);
						const	old = state.boxes.get(root) || [];
						const	used = new Set();
						const	list = [];
						const	box_color = color_of(root);

						for (const	line of lines)
						{
							const	center = line.y + line.h / 2;
							let		box = null;
							let		best = line.h * 0.6;

							for (const	candidate of old)
							{
								if (used.has(candidate))
									continue ;

								const	distance = Math.abs(candidate.selection_center - center);

								if (distance < best)
								{
									best = distance;
									box = candidate;
								}
							}

							if (box)
								used.add(box);
							else
							{
								box = document.createElement("div");
								box.className = "selection_box";
								state.inner.appendChild(box);
							}

							box.selection_center = center;
							box.selection_color = box_color;
							box.selection_root = root;
							set_style(box, "left", line.x + "px");
							set_style(box, "top", line.y + "px");
							set_style(box, "width", line.w + "px");
							set_style(box, "height", line.h + "px");
							set_style(box, "backgroundColor", box_color);
							list.push(box);
						}

						for (const	box of old)
							if (!used.has(box))
								box.remove();

						state.boxes.delete(root);
						next_boxes.set(root, list);
					}

					for (const	list of state.boxes.values())
						for (const	box of list)
							box.remove();

					state.boxes = next_boxes;
				}

				for (const	state of group_states.values())
					remove_group(state);

				group_states = next_states;
				info_cache = context_cache = frame_cache = null;

				if (
					group_states.size && document.getAnimations &&
					document.getAnimations().some(
						function(animation){return (animation.playState === "running");}
					)
				)
					request_render(false);
			}

			function
				request_render(from_selection)
			{
				if (from_selection)
					selection_changed = true;

				if (running && !frame_id)
					frame_id = window.requestAnimationFrame(render);
			}

			function
				on_mutation(records)
			{
				for (const	record of records)
				{
					if (
						!overlay || (
							!overlay.contains(record.target) &&
							record.target !== filter_svg &&
							record.target !== style_element
						)
					)
					{
						if (group_states.size || !document.getSelection().isCollapsed)
							request_render(false);

						return ;
					}
				}
			}

			function
				find_handler(root)
			{
				const	name = root.getAttribute("data-selection-oncopy");

				if (name)
				{
					if (handlers.has(name))
						return (handlers.get(name));

					if (typeof(global_object[name]) === "function")
						return (global_object[name]);
				}

				return (on_copy);
			}

			function
				on_copy_event()
			{
				const	boxes = [];

				for (const	state of group_states.values())
				{
					for (const	[root, list] of state.boxes)
					{
						const	handler = find_handler(root);

						for (const	box of list)
						{
							box.setAttribute("data-copied", "");
							boxes.push(box);

							if (handler)
							{
								try
								{
									handler(box.selection_color, box, root);
								}
								catch (error)
								{
									console.error(error);
								}
							}
						}
					}
				}

				if (copy_timer)
					window.clearTimeout(copy_timer);

				copy_timer = window.setTimeout(
					function()
					{
						copy_timer = 0;

						for (const	box of boxes)
							box.removeAttribute("data-copied");
					},
					copy_duration
				);
			}

			document.addEventListener(
				"selectionchange",
				function(){request_render(true);},
				listen
			);
			document.addEventListener(
				"scroll",
				function(){request_render(false);},
				{signal: abort.signal, passive: true, capture: true}
			);
			window.addEventListener(
				"resize",
				function(){request_render(false);},
				listen
			);
			document.addEventListener("copy", on_copy_event, listen);

			if (document.fonts && document.fonts.addEventListener)
			{
				document.fonts.addEventListener(
					"loadingdone",
					function(){request_render(false);},
					listen
				);
			}

			if (document.readyState === "loading")
				document.addEventListener("DOMContentLoaded", mount, {signal: abort.signal, once: true});
			else
				mount();

			const	instance =
			{
				stop: function()
				{
					if (!running)
						return ;

					running = false;
					abort.abort();

					if (frame_id)
						window.cancelAnimationFrame(frame_id);

					if (copy_timer)
						window.clearTimeout(copy_timer);

					if (resize_observer)
						resize_observer.disconnect();

					if (mutation_observer)
						mutation_observer.disconnect();

					clear();

					if (overlay)
					{
						overlay.classList.remove(id, INSTANT_CLASS);
						overlay.style.filter = "";

						if (overlay_created)
							overlay.remove();
					}

					if (filter_svg)
						filter_svg.remove();

					if (style_element)
						style_element.remove();

					if (active_instance === instance)
						active_instance = null;
				},

				refresh: function()
				{
					request_render(false);
					return (instance);
				},

				set_color: function(value)
				{
					color = to_css_color(value);
					request_render(true);
					return (instance);
				},

				set_goo: function(value)
				{
					goo = (
						value === false ? null :
						{...GOO_DEFAULTS, ...(typeof(value) === "object" ? value : {})}
					);
					apply_goo();
					return (instance);
				},

				set_on_copy: function(handler)
				{
					on_copy = typeof(handler) === "function" ? handler : null;
					return (instance);
				},

				add_copy_handler: function(name, handler)
				{
					handlers.set(name, handler);
					return (instance);
				},

				remove_copy_handler: function(name)
				{
					handlers.delete(name);
					return (instance);
				},

				get running() {return (running);}
			};

			active_instance = instance;
			return (instance);
		}

		const	soft_selection = Object.freeze(
			{
				start: start,
				stop: function()
				{
					if (active_instance)
						active_instance.stop();
				}
			}
		);

		if (typeof(module) === "object" && module.exports)
			module.exports = soft_selection;

		global_object.soft_selection = soft_selection;
	}
)(typeof(globalThis) !== "undefined" ? globalThis : this);
