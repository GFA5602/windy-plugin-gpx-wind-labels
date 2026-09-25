const __pluginConfig =  {
  "name": "windy-plugin-gpx-wind-labels",
  "version": "0.1.0",
  "icon": "⛵",
  "title": "GPX Wind Labels",
  "description": "Affiche les points GPX avec leur date, la direction et la vitesse du vent.",
  "author": "Gaël Fabry",
  "private": true,
  "desktopUI": "rhpane",
  "mobileUI": "fullscreen",
  "built": 1790331939618,
  "builtReadable": "2026-09-25T10:25:39.618Z",
  "screenshot": "screenshot.jpg"
};

// transformCode: import { map } from '@windy/map';
const { map } = W.map;

// transformCode: import { getLatLonInterpolator } from '@windy/interpolator';
const { getLatLonInterpolator } = W.interpolator;


/** @returns {void} */
function noop() {}

function run(fn) {
	return fn();
}

function blank_object() {
	return Object.create(null);
}

/**
 * @param {Function[]} fns
 * @returns {void}
 */
function run_all(fns) {
	fns.forEach(run);
}

/**
 * @param {any} thing
 * @returns {thing is Function}
 */
function is_function(thing) {
	return typeof thing === 'function';
}

/** @returns {boolean} */
function safe_not_equal(a, b) {
	return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

/** @returns {boolean} */
function is_empty(obj) {
	return Object.keys(obj).length === 0;
}

/**
 * @param {Node} target
 * @param {Node} node
 * @returns {void}
 */
function append(target, node) {
	target.appendChild(node);
}

/**
 * @param {Node} target
 * @param {string} style_sheet_id
 * @param {string} styles
 * @returns {void}
 */
function append_styles(target, style_sheet_id, styles) {
	const append_styles_to = get_root_for_style(target);
	if (!append_styles_to.getElementById(style_sheet_id)) {
		const style = element('style');
		style.id = style_sheet_id;
		style.textContent = styles;
		append_stylesheet(append_styles_to, style);
	}
}

/**
 * @param {Node} node
 * @returns {ShadowRoot | Document}
 */
function get_root_for_style(node) {
	if (!node) return document;
	const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
	if (root && /** @type {ShadowRoot} */ (root).host) {
		return /** @type {ShadowRoot} */ (root);
	}
	return node.ownerDocument;
}

/**
 * @param {ShadowRoot | Document} node
 * @param {HTMLStyleElement} style
 * @returns {CSSStyleSheet}
 */
function append_stylesheet(node, style) {
	append(/** @type {Document} */ (node).head || node, style);
	return style.sheet;
}

/**
 * @param {Node} target
 * @param {Node} node
 * @param {Node} [anchor]
 * @returns {void}
 */
function insert(target, node, anchor) {
	target.insertBefore(node, anchor || null);
}

/**
 * @param {Node} node
 * @returns {void}
 */
function detach(node) {
	if (node.parentNode) {
		node.parentNode.removeChild(node);
	}
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} name
 * @returns {HTMLElementTagNameMap[K]}
 */
function element(name) {
	return document.createElement(name);
}

/**
 * @param {string} data
 * @returns {Text}
 */
function text(data) {
	return document.createTextNode(data);
}

/**
 * @returns {Text} */
function space() {
	return text(' ');
}

/**
 * @param {EventTarget} node
 * @param {string} event
 * @param {EventListenerOrEventListenerObject} handler
 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
 * @returns {() => void}
 */
function listen(node, event, handler, options) {
	node.addEventListener(event, handler, options);
	return () => node.removeEventListener(event, handler, options);
}

/**
 * @param {Element} node
 * @param {string} attribute
 * @param {string} [value]
 * @returns {void}
 */
function attr(node, attribute, value) {
	if (value == null) node.removeAttribute(attribute);
	else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
}

/**
 * @param {Element} element
 * @returns {ChildNode[]}
 */
function children(element) {
	return Array.from(element.childNodes);
}

/**
 * @param {Text} text
 * @param {unknown} data
 * @returns {void}
 */
function set_data(text, data) {
	data = '' + data;
	if (text.data === data) return;
	text.data = /** @type {string} */ (data);
}

/**
 * @returns {void} */
function set_input_value(input, value) {
	input.value = value == null ? '' : value;
}

/**
 * @returns {void} */
function select_option(select, value, mounting) {
	for (let i = 0; i < select.options.length; i += 1) {
		const option = select.options[i];
		if (option.__value === value) {
			option.selected = true;
			return;
		}
	}
	if (!mounting || value !== undefined) {
		select.selectedIndex = -1; // no option should be selected
	}
}

function select_value(select) {
	const selected_option = select.querySelector(':checked');
	return selected_option && selected_option.__value;
}

/**
 * @returns {void} */
function toggle_class(element, name, toggle) {
	// The `!!` is required because an `undefined` flag means flipping the current state.
	element.classList.toggle(name, !!toggle);
}

/**
 * @typedef {Node & {
 * 	claim_order?: number;
 * 	hydrate_init?: true;
 * 	actual_end_child?: NodeEx;
 * 	childNodes: NodeListOf<NodeEx>;
 * }} NodeEx
 */

/** @typedef {ChildNode & NodeEx} ChildNodeEx */

/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

/**
 * @typedef {ChildNodeEx[] & {
 * 	claim_info?: {
 * 		last_index: number;
 * 		total_claimed: number;
 * 	};
 * }} ChildNodeArray
 */

let current_component;

/** @returns {void} */
function set_current_component(component) {
	current_component = component;
}

function get_current_component() {
	if (!current_component) throw new Error('Function called outside component initialization');
	return current_component;
}

/**
 * Schedules a callback to run immediately before the component is unmounted.
 *
 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
 * only one that runs inside a server-side component.
 *
 * https://svelte.dev/docs/svelte#ondestroy
 * @param {() => any} fn
 * @returns {void}
 */
function onDestroy(fn) {
	get_current_component().$$.on_destroy.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];

let render_callbacks = [];

const flush_callbacks = [];

const resolved_promise = /* @__PURE__ */ Promise.resolve();

let update_scheduled = false;

/** @returns {void} */
function schedule_update() {
	if (!update_scheduled) {
		update_scheduled = true;
		resolved_promise.then(flush);
	}
}

/** @returns {void} */
function add_render_callback(fn) {
	render_callbacks.push(fn);
}

// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();

let flushidx = 0; // Do *not* move this inside the flush() function

/** @returns {void} */
function flush() {
	// Do not reenter flush while dirty components are updated, as this can
	// result in an infinite loop. Instead, let the inner flush handle it.
	// Reentrancy is ok afterwards for bindings etc.
	if (flushidx !== 0) {
		return;
	}
	const saved_component = current_component;
	do {
		// first, call beforeUpdate functions
		// and update components
		try {
			while (flushidx < dirty_components.length) {
				const component = dirty_components[flushidx];
				flushidx++;
				set_current_component(component);
				update(component.$$);
			}
		} catch (e) {
			// reset dirty state to not end up in a deadlocked state and then rethrow
			dirty_components.length = 0;
			flushidx = 0;
			throw e;
		}
		set_current_component(null);
		dirty_components.length = 0;
		flushidx = 0;
		while (binding_callbacks.length) binding_callbacks.pop()();
		// then, once components are updated, call
		// afterUpdate functions. This may cause
		// subsequent updates...
		for (let i = 0; i < render_callbacks.length; i += 1) {
			const callback = render_callbacks[i];
			if (!seen_callbacks.has(callback)) {
				// ...so guard against infinite loops
				seen_callbacks.add(callback);
				callback();
			}
		}
		render_callbacks.length = 0;
	} while (dirty_components.length);
	while (flush_callbacks.length) {
		flush_callbacks.pop()();
	}
	update_scheduled = false;
	seen_callbacks.clear();
	set_current_component(saved_component);
}

/** @returns {void} */
function update($$) {
	if ($$.fragment !== null) {
		$$.update();
		run_all($$.before_update);
		const dirty = $$.dirty;
		$$.dirty = [-1];
		$$.fragment && $$.fragment.p($$.ctx, dirty);
		$$.after_update.forEach(add_render_callback);
	}
}

/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 * @param {Function[]} fns
 * @returns {void}
 */
function flush_render_callbacks(fns) {
	const filtered = [];
	const targets = [];
	render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
	targets.forEach((c) => c());
	render_callbacks = filtered;
}

const outroing = new Set();

/**
 * @param {import('./private.js').Fragment} block
 * @param {0 | 1} [local]
 * @returns {void}
 */
function transition_in(block, local) {
	if (block && block.i) {
		outroing.delete(block);
		block.i(local);
	}
}

/** @typedef {1} INTRO */
/** @typedef {0} OUTRO */
/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

/**
 * @typedef {Object} Outro
 * @property {number} r
 * @property {Function[]} c
 * @property {Object} p
 */

/**
 * @typedef {Object} PendingProgram
 * @property {number} start
 * @property {INTRO|OUTRO} b
 * @property {Outro} [group]
 */

/**
 * @typedef {Object} Program
 * @property {number} a
 * @property {INTRO|OUTRO} b
 * @property {1|-1} d
 * @property {number} duration
 * @property {number} start
 * @property {number} end
 * @property {Outro} [group]
 */

/** @returns {void} */
function mount_component(component, target, anchor) {
	const { fragment, after_update } = component.$$;
	fragment && fragment.m(target, anchor);
	// onMount happens before the initial afterUpdate
	add_render_callback(() => {
		const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
		// if the component was destroyed immediately
		// it will update the `$$.on_destroy` reference to `null`.
		// the destructured on_destroy may still reference to the old array
		if (component.$$.on_destroy) {
			component.$$.on_destroy.push(...new_on_destroy);
		} else {
			// Edge case - component was destroyed immediately,
			// most likely as a result of a binding initialising
			run_all(new_on_destroy);
		}
		component.$$.on_mount = [];
	});
	after_update.forEach(add_render_callback);
}

/** @returns {void} */
function destroy_component(component, detaching) {
	const $$ = component.$$;
	if ($$.fragment !== null) {
		flush_render_callbacks($$.after_update);
		run_all($$.on_destroy);
		$$.fragment && $$.fragment.d(detaching);
		// TODO null out other refs, including component.$$ (but need to
		// preserve final state?)
		$$.on_destroy = $$.fragment = null;
		$$.ctx = [];
	}
}

/** @returns {void} */
function make_dirty(component, i) {
	if (component.$$.dirty[0] === -1) {
		dirty_components.push(component);
		schedule_update();
		component.$$.dirty.fill(0);
	}
	component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
}

// TODO: Document the other params
/**
 * @param {SvelteComponent} component
 * @param {import('./public.js').ComponentConstructorOptions} options
 *
 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
 * This will be the `add_css` function from the compiled component.
 *
 * @returns {void}
 */
function init(
	component,
	options,
	instance,
	create_fragment,
	not_equal,
	props,
	append_styles = null,
	dirty = [-1]
) {
	const parent_component = current_component;
	set_current_component(component);
	/** @type {import('./private.js').T$$} */
	const $$ = (component.$$ = {
		fragment: null,
		ctx: [],
		// state
		props,
		update: noop,
		not_equal,
		bound: blank_object(),
		// lifecycle
		on_mount: [],
		on_destroy: [],
		on_disconnect: [],
		before_update: [],
		after_update: [],
		context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
		// everything else
		callbacks: blank_object(),
		dirty,
		skip_bound: false,
		root: options.target || parent_component.$$.root
	});
	append_styles && append_styles($$.root);
	let ready = false;
	$$.ctx = instance
		? instance(component, options.props || {}, (i, ret, ...rest) => {
				const value = rest.length ? rest[0] : ret;
				if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
					if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
					if (ready) make_dirty(component, i);
				}
				return ret;
		  })
		: [];
	$$.update();
	ready = true;
	run_all($$.before_update);
	// `false` as a special case of no DOM component
	$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
	if (options.target) {
		if (options.hydrate) {
			// TODO: what is the correct type here?
			// @ts-expect-error
			const nodes = children(options.target);
			$$.fragment && $$.fragment.l(nodes);
			nodes.forEach(detach);
		} else {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			$$.fragment && $$.fragment.c();
		}
		if (options.intro) transition_in(component.$$.fragment);
		mount_component(component, options.target, options.anchor);
		flush();
	}
	set_current_component(parent_component);
}

/**
 * Base class for Svelte components. Used when dev=false.
 *
 * @template {Record<string, any>} [Props=any]
 * @template {Record<string, any>} [Events=any]
 */
class SvelteComponent {
	/**
	 * ### PRIVATE API
	 *
	 * Do not use, may change at any time
	 *
	 * @type {any}
	 */
	$$ = undefined;
	/**
	 * ### PRIVATE API
	 *
	 * Do not use, may change at any time
	 *
	 * @type {any}
	 */
	$$set = undefined;

	/** @returns {void} */
	$destroy() {
		destroy_component(this, 1);
		this.$destroy = noop;
	}

	/**
	 * @template {Extract<keyof Events, string>} K
	 * @param {K} type
	 * @param {((e: Events[K]) => void) | null | undefined} callback
	 * @returns {() => void}
	 */
	$on(type, callback) {
		if (!is_function(callback)) {
			return noop;
		}
		const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
		callbacks.push(callback);
		return () => {
			const index = callbacks.indexOf(callback);
			if (index !== -1) callbacks.splice(index, 1);
		};
	}

	/**
	 * @param {Partial<Props>} props
	 * @returns {void}
	 */
	$set(props) {
		if (this.$$set && !is_empty(props)) {
			this.$$.skip_bound = true;
			this.$$set(props);
			this.$$.skip_bound = false;
		}
	}
}

/**
 * @typedef {Object} CustomElementPropDefinition
 * @property {string} [attribute]
 * @property {boolean} [reflect]
 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
 */

// generated during release, do not modify

const PUBLIC_VERSION = '4';

if (typeof window !== 'undefined')
	// @ts-ignore
	(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

/* src\plugin.svelte generated by Svelte v4.2.20 */

function add_css(target) {
	append_styles(target, "svelte-18nxnmm", ".gpx-panel.svelte-18nxnmm.svelte-18nxnmm{display:flex;flex-direction:column;gap:12px;padding:16px}input[type='file'].svelte-18nxnmm.svelte-18nxnmm{width:100%}.file-label.svelte-18nxnmm.svelte-18nxnmm{font-weight:600}.options.svelte-18nxnmm.svelte-18nxnmm{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:8px;background:rgba(255, 255, 255, 0.08)}.options.svelte-18nxnmm label.svelte-18nxnmm{display:flex;align-items:center;justify-content:space-between;gap:12px}.actions.svelte-18nxnmm.svelte-18nxnmm{display:flex;gap:8px}button.svelte-18nxnmm.svelte-18nxnmm{padding:8px 12px;border:0;border-radius:6px;background:#00aef3;color:white;cursor:pointer;font-weight:600}button.secondary.svelte-18nxnmm.svelte-18nxnmm{background:#555}.status.svelte-18nxnmm.svelte-18nxnmm{margin:0;padding:10px;border-left:4px solid #00aef3;background:rgba(0, 174, 243, 0.12)}.status-error.svelte-18nxnmm.svelte-18nxnmm{border-left-color:#e74c3c;background:rgba(231, 76, 60, 0.12)}.information.svelte-18nxnmm.svelte-18nxnmm{margin:0;font-size:0.9rem;opacity:0.85}.gpx-wind-icon{background:transparent;border:none}.gpx-wind-label{display:inline-flex;align-items:center;justify-content:center;min-width:100px;height:22px;padding:0 5px;color:#ffffff;background:rgba(12, 28, 38, 0.88);border:1px solid rgba(255, 255, 255, 0.75);border-radius:4px;box-shadow:0 2px 6px rgba(0, 0, 0, 0.45);font-family:ui-monospace,\r\n            SFMono-Regular,\r\n            Menlo,\r\n            Monaco,\r\n            Consolas,\r\n            monospace;font-size:11px;font-weight:700;line-height:22px;white-space:nowrap;text-align:center}");
}

// (37:8) {#if status}
function create_if_block_1(ctx) {
	let p;
	let t;

	return {
		c() {
			p = element("p");
			t = text(/*status*/ ctx[3]);
			attr(p, "class", "status svelte-18nxnmm");
			toggle_class(p, "status-error", /*hasError*/ ctx[4]);
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t);
		},
		p(ctx, dirty) {
			if (dirty & /*status*/ 8) set_data(t, /*status*/ ctx[3]);

			if (dirty & /*hasError*/ 16) {
				toggle_class(p, "status-error", /*hasError*/ ctx[4]);
			}
		},
		d(detaching) {
			if (detaching) {
				detach(p);
			}
		}
	};
}

// (43:8) {#if points.length > 0}
function create_if_block(ctx) {
	let div;
	let button0;
	let t1;
	let button1;
	let t3;
	let p0;
	let t4_value = /*points*/ ctx[0].length + "";
	let t4;
	let t5;
	let t6_value = (/*points*/ ctx[0].length > 1 ? 's' : '') + "";
	let t6;
	let t7;
	let t8_value = (/*points*/ ctx[0].length > 1 ? 's' : '') + "";
	let t8;
	let t9;
	let t10;
	let p1;
	let t12;
	let p2;
	let mounted;
	let dispose;

	return {
		c() {
			div = element("div");
			button0 = element("button");
			button0.textContent = "Actualiser le vent";
			t1 = space();
			button1 = element("button");
			button1.textContent = "Effacer";
			t3 = space();
			p0 = element("p");
			t4 = text(t4_value);
			t5 = text(" point");
			t6 = text(t6_value);
			t7 = text(" GPX\r\n                chargé");
			t8 = text(t8_value);
			t9 = text(".");
			t10 = space();
			p1 = element("p");
			p1.textContent = "Format : jour-heure, direction-vitesse.";
			t12 = space();
			p2 = element("p");
			p2.innerHTML = `Exemple : <strong>25-14 287-18</strong>`;
			attr(button0, "class", "svelte-18nxnmm");
			attr(button1, "class", "secondary svelte-18nxnmm");
			attr(div, "class", "actions svelte-18nxnmm");
			attr(p0, "class", "information svelte-18nxnmm");
			attr(p1, "class", "information svelte-18nxnmm");
			attr(p2, "class", "information svelte-18nxnmm");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, button0);
			append(div, t1);
			append(div, button1);
			insert(target, t3, anchor);
			insert(target, p0, anchor);
			append(p0, t4);
			append(p0, t5);
			append(p0, t6);
			append(p0, t7);
			append(p0, t8);
			append(p0, t9);
			insert(target, t10, anchor);
			insert(target, p1, anchor);
			insert(target, t12, anchor);
			insert(target, p2, anchor);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*refreshMarkers*/ ctx[6]),
					listen(button1, "click", /*clearTrack*/ ctx[7])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty & /*points*/ 1 && t4_value !== (t4_value = /*points*/ ctx[0].length + "")) set_data(t4, t4_value);
			if (dirty & /*points*/ 1 && t6_value !== (t6_value = (/*points*/ ctx[0].length > 1 ? 's' : '') + "")) set_data(t6, t6_value);
			if (dirty & /*points*/ 1 && t8_value !== (t8_value = (/*points*/ ctx[0].length > 1 ? 's' : '') + "")) set_data(t8, t8_value);
		},
		d(detaching) {
			if (detaching) {
				detach(div);
				detach(t3);
				detach(p0);
				detach(t10);
				detach(p1);
				detach(t12);
				detach(p2);
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let section;
	let div0;
	let t1;
	let div2;
	let label0;
	let t3;
	let input0;
	let t4;
	let div1;
	let label1;
	let t5;
	let select;
	let option0;
	let option1;
	let option2;
	let t9;
	let label2;
	let input1;
	let t10;
	let t11;
	let t12;
	let mounted;
	let dispose;
	let if_block0 = /*status*/ ctx[3] && create_if_block_1(ctx);
	let if_block1 = /*points*/ ctx[0].length > 0 && create_if_block(ctx);

	return {
		c() {
			section = element("section");
			div0 = element("div");
			div0.textContent = "GPX Wind Labels";
			t1 = space();
			div2 = element("div");
			label0 = element("label");
			label0.textContent = "Sélectionner un fichier GPX";
			t3 = space();
			input0 = element("input");
			t4 = space();
			div1 = element("div");
			label1 = element("label");
			t5 = text("Unité\r\n                ");
			select = element("select");
			option0 = element("option");
			option0.textContent = "nœuds";
			option1 = element("option");
			option1.textContent = "km/h";
			option2 = element("option");
			option2.textContent = "m/s";
			t9 = space();
			label2 = element("label");
			input1 = element("input");
			t10 = text("\r\n                Centrer la carte après import");
			t11 = space();
			if (if_block0) if_block0.c();
			t12 = space();
			if (if_block1) if_block1.c();
			attr(div0, "class", "plugin__title");
			attr(label0, "class", "file-label svelte-18nxnmm");
			attr(label0, "for", "gpx-file");
			attr(input0, "id", "gpx-file");
			attr(input0, "type", "file");
			attr(input0, "accept", ".gpx,application/gpx+xml,application/xml,text/xml");
			attr(input0, "class", "svelte-18nxnmm");
			option0.__value = "kt";
			set_input_value(option0, option0.__value);
			option1.__value = "kmh";
			set_input_value(option1, option1.__value);
			option2.__value = "ms";
			set_input_value(option2, option2.__value);
			if (/*speedUnit*/ ctx[1] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[8].call(select));
			attr(label1, "class", "svelte-18nxnmm");
			attr(input1, "type", "checkbox");
			attr(label2, "class", "svelte-18nxnmm");
			attr(div1, "class", "options svelte-18nxnmm");
			attr(div2, "class", "gpx-panel svelte-18nxnmm");
			attr(section, "class", "plugin__content");
		},
		m(target, anchor) {
			insert(target, section, anchor);
			append(section, div0);
			append(section, t1);
			append(section, div2);
			append(div2, label0);
			append(div2, t3);
			append(div2, input0);
			append(div2, t4);
			append(div2, div1);
			append(div1, label1);
			append(label1, t5);
			append(label1, select);
			append(select, option0);
			append(select, option1);
			append(select, option2);
			select_option(select, /*speedUnit*/ ctx[1], true);
			append(div1, t9);
			append(div1, label2);
			append(label2, input1);
			input1.checked = /*fitAfterImport*/ ctx[2];
			append(label2, t10);
			append(div2, t11);
			if (if_block0) if_block0.m(div2, null);
			append(div2, t12);
			if (if_block1) if_block1.m(div2, null);

			if (!mounted) {
				dispose = [
					listen(input0, "change", /*handleFileSelection*/ ctx[5]),
					listen(select, "change", /*select_change_handler*/ ctx[8]),
					listen(select, "change", /*refreshMarkers*/ ctx[6]),
					listen(input1, "change", /*input1_change_handler*/ ctx[9])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*speedUnit*/ 2) {
				select_option(select, /*speedUnit*/ ctx[1]);
			}

			if (dirty & /*fitAfterImport*/ 4) {
				input1.checked = /*fitAfterImport*/ ctx[2];
			}

			if (/*status*/ ctx[3]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(div2, t12);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*points*/ ctx[0].length > 0) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div2, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) {
				detach(section);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function parseGpx(xml) {
	const parser = new DOMParser();
	const document = parser.parseFromString(xml, 'application/xml');
	const parserError = document.querySelector('parsererror');

	if (parserError) {
		throw new Error('Le fichier GPX contient un XML invalide.');
	}

	const xmlPoints = [
		...Array.from(document.getElementsByTagNameNS('*', 'trkpt')),
		...Array.from(document.getElementsByTagNameNS('*', 'rtept')),
		...Array.from(document.getElementsByTagNameNS('*', 'wpt'))
	];

	return xmlPoints.map(element => {
		const lat = Number(element.getAttribute('lat'));
		const lon = Number(element.getAttribute('lon'));

		if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
			return null;
		}

		const timeElement = element.getElementsByTagNameNS('*', 'time')[0];
		const timeValue = timeElement?.textContent?.trim();
		const parsedTime = timeValue ? new Date(timeValue) : null;

		return {
			lat,
			lon,
			time: parsedTime && !Number.isNaN(parsedTime.getTime())
			? parsedTime
			: null
		};
	}).filter(point => point !== null);
}

function extractWind(rawValue) {
	if (!Array.isArray(rawValue) || rawValue.length < 2) {
		return null;
	}

	const u = Number(rawValue[0]);
	const v = Number(rawValue[1]);

	if (!Number.isFinite(u) || !Number.isFinite(v)) {
		return null;
	}

	const speedMs = Math.sqrt(u * u + v * v);
	const direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
	return { direction, speedMs };
}

function pad2(value) {
	return String(value).padStart(2, '0');
}

function escapeHtml(value) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function yieldToBrowser() {
	return new Promise(resolve => {
			window.requestAnimationFrame(() => resolve());
		});
}

function instance($$self, $$props, $$invalidate) {
	let points = [];
	let markerLayer = null;
	let trackLayer = null;
	let speedUnit = 'kt';
	let fitAfterImport = true;
	let status = '';
	let hasError = false;
	let refreshGeneration = 0;

	async function handleFileSelection(event) {
		const input = event.currentTarget;
		const file = input.files?.[0];

		if (!file) {
			return;
		}

		clearTrack();
		$$invalidate(3, status = `Lecture de ${file.name}…`);
		$$invalidate(4, hasError = false);

		try {
			const xml = await file.text();
			$$invalidate(0, points = parseGpx(xml));

			if (points.length === 0) {
				throw new Error('Le fichier ne contient aucun point GPX exploitable.');
			}

			drawTrack();

			if (fitAfterImport) {
				fitMapToTrack();
			}

			await refreshMarkers();
		} catch(error) {
			console.error(error);
			$$invalidate(0, points = []);
			$$invalidate(4, hasError = true);

			$$invalidate(3, status = error instanceof Error
			? error.message
			: 'Impossible de lire le fichier GPX.');
		}
	}

	function drawTrack() {
		if (trackLayer) {
			map.removeLayer(trackLayer);
		}

		const coordinates = points.map(point => [point.lat, point.lon]);

		trackLayer = L.polyline(coordinates, {
			color: '#00aef3',
			weight: 3,
			opacity: 0.85
		}).addTo(map);
	}

	function fitMapToTrack() {
		if (!trackLayer) {
			return;
		}

		const bounds = trackLayer.getBounds();

		if (bounds.isValid()) {
			map.fitBounds(bounds, { padding: [30, 30] });
		}
	}

	async function refreshMarkers() {
		if (points.length === 0) {
			return;
		}

		const generation = ++refreshGeneration;
		$$invalidate(4, hasError = false);
		$$invalidate(3, status = 'Interpolation du vent…');
		removeMarkers();
		markerLayer = L.layerGroup().addTo(map);

		try {
			const interpolate = await getLatLonInterpolator();

			if (!interpolate) {
				throw new Error('Les données de vent ne sont pas disponibles. ' + 'Affichez la couche Vent dans Windy puis réessayez.');
			}

			let displayedCount = 0;
			const batchSize = 100;

			for (let batchStart = 0; batchStart < points.length; batchStart += batchSize) {
				if (generation !== refreshGeneration) {
					return;
				}

				const batch = points.slice(batchStart, batchStart + batchSize);

				const results = await Promise.all(batch.map(async point => {
					const rawValue = await interpolate({ lat: point.lat, lon: point.lon });
					return { point, wind: extractWind(rawValue) };
				}));

				for (const result of results) {
					if (!result.wind || !markerLayer) {
						continue;
					}

					addWindMarker(result.point, result.wind, markerLayer);
					displayedCount++;
				}

				$$invalidate(3, status = `${Math.min(batchStart + batchSize, points.length)}` + `/${points.length} points analysés…`);
				await yieldToBrowser();
			}

			$$invalidate(3, status = `${displayedCount} étiquette` + `${displayedCount > 1 ? 's' : ''} affichée` + `${displayedCount > 1 ? 's' : ''}.`);
		} catch(error) {
			console.error(error);
			$$invalidate(4, hasError = true);

			$$invalidate(3, status = error instanceof Error
			? error.message
			: 'Impossible d’interpoler le vent.');
		}
	}

	function addWindMarker(point, wind, layer) {
		const text = formatLabel(point, wind);

		const icon = L.divIcon({
			className: 'gpx-wind-icon',
			html: `<div class="gpx-wind-label">${escapeHtml(text)}</div>`,
			iconSize: [110, 24],
			iconAnchor: [55, 12]
		});

		L.marker([point.lat, point.lon], { icon, interactive: true, keyboard: false }).bindTooltip(buildTooltip(point, wind), { direction: 'top', opacity: 0.95 }).addTo(layer);
	}

	function formatLabel(point, wind) {
		const datePart = point.time
		? `${pad2(point.time.getUTCDate())}-${pad2(point.time.getUTCHours())}`
		: '-- --';

		const direction = String(Math.round(wind.direction) % 360).padStart(3, '0');
		const speed = String(Math.round(convertSpeed(wind.speedMs))).padStart(2, '0');
		return `${datePart} ${direction}-${speed}`;
	}

	function buildTooltip(point, wind) {
		const time = point.time
		? point.time.toLocaleString('fr-FR', {
				dateStyle: 'short',
				timeStyle: 'short',
				timeZone: 'UTC'
			}) + ' UTC'
		: 'Horodatage absent';

		const direction = Math.round(wind.direction);
		const speed = convertSpeed(wind.speedMs).toFixed(1);

		return [
			`<strong>${escapeHtml(time)}</strong>`,
			`Direction : ${direction.toString().padStart(3, '0')}°`,
			`Vitesse : ${speed} ${getUnitLabel()}`
		].join('<br>');
	}

	function convertSpeed(speedMs) {
		switch (speedUnit) {
			case 'kt':
				return speedMs * 1.9438444924;
			case 'kmh':
				return speedMs * 3.6;
			default:
				return speedMs;
		}
	}

	function getUnitLabel() {
		switch (speedUnit) {
			case 'kt':
				return 'kt';
			case 'kmh':
				return 'km/h';
			default:
				return 'm/s';
		}
	}

	function removeMarkers() {
		if (markerLayer) {
			map.removeLayer(markerLayer);
			markerLayer = null;
		}
	}

	function clearTrack() {
		refreshGeneration++;
		removeMarkers();

		if (trackLayer) {
			map.removeLayer(trackLayer);
			trackLayer = null;
		}

		$$invalidate(0, points = []);
		$$invalidate(3, status = '');
		$$invalidate(4, hasError = false);
	}

	onDestroy(() => {
		clearTrack();
	});

	function select_change_handler() {
		speedUnit = select_value(this);
		$$invalidate(1, speedUnit);
	}

	function input1_change_handler() {
		fitAfterImport = this.checked;
		$$invalidate(2, fitAfterImport);
	}

	return [
		points,
		speedUnit,
		fitAfterImport,
		status,
		hasError,
		handleFileSelection,
		refreshMarkers,
		clearTrack,
		select_change_handler,
		input1_change_handler
	];
}

class Plugin extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {}, add_css);
	}
}


// transformCode: Export statement was modified
export { __pluginConfig, Plugin as default };
//# sourceMappingURL=plugin.js.map
